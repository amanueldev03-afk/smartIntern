import logging
from typing import List, Optional
import numpy as np
from scipy.optimize import linear_sum_assignment

from django.db import transaction
from apps.universities.models import InHouseCohort
from apps.accounts.models import StudentProfile
from apps.projects.models import ProjectTeam, TeamMember

logger = logging.getLogger(__name__)

FRONTEND_KEYWORDS = {
    "react", "react native", "flutter", "vue", "vue.js", "angular", "frontend",
    "front-end", "mobile", "html", "css", "javascript", "typescript", "dart",
    "tailwind", "next.js", "ios", "android", "swift", "kotlin"
}

BACKEND_KEYWORDS = {
    "django", "python", "node", "nodejs", "node.js", "express", "postgresql",
    "postgres", "mysql", "mongodb", "backend", "back-end", "api", "rest",
    "graphql", "fastapi", "flask", "sql", "database", "go", "golang", "java",
    "spring", "spring boot"
}

DEVOPS_QA_UX_KEYWORDS = {
    "devops", "docker", "kubernetes", "ci/cd", "cicd", "qa", "testing",
    "selenium", "cypress", "pytest", "aws", "cloud", "linux", "git",
    "github actions", "ui/ux", "ui", "ux", "figma", "adobe xd", "design",
    "wireframing", "prototyping", "user experience", "user interface"
}

ROLE_FRONTEND = "Frontend Developer"
ROLE_BACKEND = "Backend Developer"
ROLE_DEVOPS_QA_UX = "DevOps/QA/UX Specialist"


def _score_student_skills(student: StudentProfile):
    """
    Computes affinity scores for a student across the three squad domains
    based on their registered skill_tags.
    """
    tags = [str(t).lower().strip() for t in (student.skill_tags or [])]

    fe_score = 0
    be_score = 0
    devops_score = 0

    for tag in tags:
        if any(kw == tag or kw in tag for kw in FRONTEND_KEYWORDS):
            fe_score += 2 if tag in {"react", "flutter", "frontend", "mobile"} else 1
        if any(kw == tag or kw in tag for kw in BACKEND_KEYWORDS):
            be_score += 2 if tag in {"django", "node", "postgresql", "backend", "api"} else 1
        if any(kw == tag or kw in tag for kw in DEVOPS_QA_UX_KEYWORDS):
            devops_score += 2 if tag in {"docker", "qa", "figma", "ui/ux", "devops"} else 1

    return fe_score, be_score, devops_score


def balance_inhouse_teams(
    cohort_id: str,
    squad_size: int = 5,
    students: Optional[List[StudentProfile]] = None,
    project_titles: Optional[List[str]] = None,
) -> List[ProjectTeam]:
    """
    Clusters students accepted into a Track 1 in-house cohort into balanced squads
    using their skill_tags.
    
    Each squad of squad_size=5 is balanced to contain:
      - 2 Frontend/Mobile developers (React/Flutter)
      - 2 Backend/API developers (Django/Node/PostgreSQL)
      - 1 DevOps/QA or UI/UX specialist
      
    Creates ProjectTeam instances, assigns members, and designates one member as team leader.
    """
    cohort = InHouseCohort.objects.get(id=cohort_id)

    if students is None:
        students = list(cohort.students.all())
        if not students:
            # Fallback to profiles enrolled with this university
            students = list(StudentProfile.objects.filter(university_name=cohort.university_name))

    num_students = len(students)
    if num_students < squad_size:
        raise ValueError(
            f"Insufficient students to form squads. Required at least {squad_size}, found {num_students}."
        )

    num_teams = num_students // squad_size
    num_fe_per_team = 2
    num_be_per_team = 2
    num_devops_per_team = squad_size - (num_fe_per_team + num_be_per_team)  # 1

    # Prepare slot descriptions for the balanced teams
    slot_roles = []
    for _ in range(num_teams):
        for _ in range(num_fe_per_team):
            slot_roles.append(ROLE_FRONTEND)
        for _ in range(num_be_per_team):
            slot_roles.append(ROLE_BACKEND)
        for _ in range(num_devops_per_team):
            slot_roles.append(ROLE_DEVOPS_QA_UX)

    total_slots = len(slot_roles)
    # Extra students if num_students > total_slots
    extra_students = num_students - total_slots

    # Build cost matrix for linear sum assignment (Hungarian algorithm)
    # Cost = -utility (since linear_sum_assignment minimizes cost)
    cost_matrix = np.zeros((num_students, num_students))

    scores = [_score_student_skills(s) for s in students]

    for i, (fe, be, devops) in enumerate(scores):
        for j in range(total_slots):
            role = slot_roles[j]
            if role == ROLE_FRONTEND:
                utility = fe * 10
                # Specialization bonus
                if fe > be and fe > devops:
                    utility += 5
            elif role == ROLE_BACKEND:
                utility = be * 10
                if be > fe and be > devops:
                    utility += 5
            else:  # ROLE_DEVOPS_QA_UX
                utility = devops * 10
                if devops > fe and devops > be:
                    utility += 5

            cost_matrix[i, j] = -utility

        # Extra slots if num_students > total_slots have zero base utility
        for j in range(total_slots, num_students):
            cost_matrix[i, j] = 0

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    # Map assignments: col_idx -> student
    assignments = {}
    overflow_students = []
    for r_idx, c_idx in zip(row_ind, col_ind):
        if c_idx < total_slots:
            assignments[c_idx] = (students[r_idx], slot_roles[c_idx])
        else:
            overflow_students.append(students[r_idx])

    # Organize into squads
    squads = [[] for _ in range(num_teams)]
    slot_idx = 0
    for team_idx in range(num_teams):
        # 2 Frontend
        for _ in range(num_fe_per_team):
            squads[team_idx].append(assignments[slot_idx])
            slot_idx += 1
        # 2 Backend
        for _ in range(num_be_per_team):
            squads[team_idx].append(assignments[slot_idx])
            slot_idx += 1
        # 1 DevOps/QA/UX
        for _ in range(num_devops_per_team):
            squads[team_idx].append(assignments[slot_idx])
            slot_idx += 1

    # Distribute any overflow students evenly across teams
    for idx, student in enumerate(overflow_students):
        team_idx = idx % num_teams
        fe, be, devops = _score_student_skills(student)
        best_role = ROLE_FRONTEND if fe >= be and fe >= devops else (ROLE_BACKEND if be >= devops else ROLE_DEVOPS_QA_UX)
        squads[team_idx].append((student, best_role))

    # Create teams and members atomically in DB
    created_teams = []
    with transaction.atomic():
        for i, squad in enumerate(squads):
            team_number = i + 1
            team_name = f"Squad {team_number}"
            if project_titles and i < len(project_titles):
                title = project_titles[i]
            else:
                title = f"{cohort.university_name} In-House Project {team_number}"

            team = ProjectTeam.objects.create(
                cohort=cohort,
                team_name=team_name,
                project_title=title,
                srs_status=ProjectTeam.SRSStatus.DRAFT,
                channels_active=True,
            )

            # Determine leader: highest GPA or senior academic year, fallback to first member
            def leader_key(item):
                s = item[0]
                gpa = float(s.gpa) if s.gpa is not None else 0.0
                year = s.academic_year if isinstance(s.academic_year, int) else 3
                return (gpa, year)

            leader_student = max(squad, key=leader_key)[0]

            for student, role in squad:
                is_leader = (student.id == leader_student.id)
                TeamMember.objects.create(
                    team=team,
                    student=student,
                    is_leader=is_leader,
                    assigned_role=role,
                )

            created_teams.append(team)

        cohort.enrolled_count = num_students
        cohort.save(update_fields=["enrolled_count"])

    logger.info(
        f"Successfully balanced {num_students} students into {len(created_teams)} squads for cohort {cohort.id}."
    )
    return created_teams
