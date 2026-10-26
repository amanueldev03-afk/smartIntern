import logging
from typing import List, Set, Tuple, Dict, Any, Union
import uuid

from django.db import transaction
from apps.teams.models import InHouseCohort, ProjectTeam, TeamMember
from apps.uil_profiles.models import UILStudentProfile

logger = logging.getLogger(__name__)

FRONTEND_KEYWORDS: Set[str] = {
    "react", "react native", "reactjs", "flutter", "vue", "vuejs", "angular",
    "angularjs", "javascript", "typescript", "html", "css", "tailwind",
    "android", "ios", "swift", "kotlin", "frontend", "mobile", "nextjs", "next.js",
}

BACKEND_KEYWORDS: Set[str] = {
    "python", "django", "fastapi", "flask", "node", "nodejs", "express",
    "java", "spring", "c#", ".net", "dotnet", "golang", "go", "php",
    "sql", "postgresql", "mysql", "mongodb", "redis", "backend", "api", "database",
}

DEVOPS_QA_KEYWORDS: Set[str] = {
    "docker", "kubernetes", "k8s", "ci/cd", "git", "github actions", "aws",
    "cloud", "linux", "testing", "qa", "jest", "vitest", "selenium", "devops",
    "figma", "ui", "ux", "ui/ux", "design", "graphic design",
}

ROLE_FRONTEND = "Frontend/Mobile"
ROLE_BACKEND = "Backend/API"
ROLE_DEVOPS = "DevOps-QA/UI-UX"


def get_student_skills_set(student_profile: UILStudentProfile) -> Set[str]:
    """
    Extract canonical skills from the Skill/StudentSkill tables
    via UILStudentProfile.student.skills.
    """
    skills = set()
    base_student = getattr(student_profile, "student", None)
    if base_student and hasattr(base_student, "skills"):
        for skill in base_student.skills.all():
            name = getattr(skill, "name", str(skill)).strip().lower()
            if name:
                skills.add(name)
    return skills


def classify_student_archetype(student_skills: Set[str]) -> Tuple[str, Dict[str, int]]:
    """
    Classify a student into an engineering archetype based on skill overlap:
      - Frontend/Mobile (~2 per squad)
      - Backend/API (~2 per squad)
      - DevOps-QA/UI-UX (~1 per squad)
    """
    frontend_overlap = len(student_skills.intersection(FRONTEND_KEYWORDS))
    backend_overlap = len(student_skills.intersection(BACKEND_KEYWORDS))
    devops_overlap = len(student_skills.intersection(DEVOPS_QA_KEYWORDS))

    scores = {
        ROLE_FRONTEND: frontend_overlap,
        ROLE_BACKEND: backend_overlap,
        ROLE_DEVOPS: devops_overlap,
    }

    # Determine primary role
    if devops_overlap > frontend_overlap and devops_overlap > backend_overlap:
        primary_role = ROLE_DEVOPS
    elif frontend_overlap >= backend_overlap and frontend_overlap > 0:
        primary_role = ROLE_FRONTEND
    elif backend_overlap > 0:
        primary_role = ROLE_BACKEND
    else:
        # Default distribution fallback
        primary_role = ROLE_BACKEND

    return primary_role, scores


def balance_inhouse_teams(
    cohort_id: Union[str, uuid.UUID],
    squad_size: int = 5,
) -> List[ProjectTeam]:
    """
    Cluster accepted students in a cohort into balanced squads of:
      ~2 Frontend/Mobile
      ~2 Backend/API
      ~1 DevOps-QA/UI-UX
    
    Creates ProjectTeam records, assigns TeamMember entries, and designates
    one leader per squad (highest GPA or most experienced).
    """
    cohort = InHouseCohort.objects.get(id=cohort_id)

    # 1. Fetch eligible candidate students
    accepted_students_qs = cohort.accepted_students.select_related("student").prefetch_related("student__skills")
    students_list = list(accepted_students_qs)

    # Fallback to active UIL profiles if accepted_students wasn't pre-populated
    if not students_list:
        fallback_qs = (
            UILStudentProfile.objects
            .filter(is_active_for_internship=True)
            .select_related("student")
            .prefetch_related("student__skills")
        )
        if cohort.capacity_k:
            fallback_qs = fallback_qs[:cohort.capacity_k]
        students_list = list(fallback_qs)

    total_students = len(students_list)
    if total_students == 0:
        logger.warning(f"No students found for cohort {cohort_id}. No teams formed.")
        return []

    num_squads = max(1, total_students // squad_size)
    logger.info(
        f"Balancing {total_students} students into {num_squads} squads of size ~{squad_size} for cohort {cohort.university_name}"
    )

    # 2. Categorize candidates into role pools
    categorized_students = []
    for student in students_list:
        skills = get_student_skills_set(student)
        role, scores = classify_student_archetype(skills)
        gpa_val = float(getattr(student, "gpa", 0.0) or 0.0)
        categorized_students.append({
            "profile": student,
            "skills": skills,
            "role": role,
            "scores": scores,
            "gpa": gpa_val,
        })

    frontend_pool = [s for s in categorized_students if s["role"] == ROLE_FRONTEND]
    backend_pool = [s for s in categorized_students if s["role"] == ROLE_BACKEND]
    devops_pool = [s for s in categorized_students if s["role"] == ROLE_DEVOPS]

    # Sort each pool by GPA descending for merit-based assignment
    frontend_pool.sort(key=lambda s: s["gpa"], reverse=True)
    backend_pool.sort(key=lambda s: s["gpa"], reverse=True)
    devops_pool.sort(key=lambda s: s["gpa"], reverse=True)

    squads: List[List[Dict[str, Any]]] = [[] for _ in range(num_squads)]

    # 3. Distribute ~2 Frontend/Mobile per squad
    for squad in squads:
        while len([m for m in squad if m["role"] == ROLE_FRONTEND]) < 2 and frontend_pool:
            squad.append(frontend_pool.pop(0))

    # 4. Distribute ~2 Backend/API per squad
    for squad in squads:
        while len([m for m in squad if m["role"] == ROLE_BACKEND]) < 2 and backend_pool:
            squad.append(backend_pool.pop(0))

    # 5. Distribute ~1 DevOps-QA/UI-UX per squad
    for squad in squads:
        while len([m for m in squad if m["role"] == ROLE_DEVOPS]) < 1 and devops_pool:
            squad.append(devops_pool.pop(0))

    # 6. Distribute any remaining students across squads to reach target squad_size
    remaining_pool = frontend_pool + backend_pool + devops_pool
    # Sort remaining pool by GPA descending
    remaining_pool.sort(key=lambda s: s["gpa"], reverse=True)

    # First fill squads that have less than squad_size
    for squad in squads:
        while len(squad) < squad_size and remaining_pool:
            squad.append(remaining_pool.pop(0))

    # Any remaining excess distributed round-robin
    idx = 0
    while remaining_pool:
        squads[idx % num_squads].append(remaining_pool.pop(0))
        idx += 1

    # 7. Persist ProjectTeam and TeamMember records in DB
    created_teams = []
    with transaction.atomic():
        for i, squad_members in enumerate(squads, start=1):
            if not squad_members:
                continue

            team_name = f"Squad {i}"
            project_title = f"{cohort.university_name} Campus Software House Project {i}"

            team = ProjectTeam.objects.create(
                cohort=cohort,
                team_name=team_name,
                project_title=project_title,
                srs_status=ProjectTeam.SRSStatus.DRAFT,
                channels_active=True,
            )

            # Designate team leader: student with the highest GPA in the squad
            squad_members.sort(key=lambda m: m["gpa"], reverse=True)
            leader_profile = squad_members[0]["profile"]

            for member_data in squad_members:
                profile = member_data["profile"]
                is_leader = (profile.id == leader_profile.id)
                assigned_role = member_data["role"]

                TeamMember.objects.create(
                    team=team,
                    student=profile,
                    is_leader=is_leader,
                    role=assigned_role,
                )

            created_teams.append(team)

        cohort.enrolled_count = total_students
        cohort.save(update_fields=["enrolled_count", "updated_at"])

    logger.info(f"Successfully balanced and created {len(created_teams)} teams for cohort {cohort.id}")
    return created_teams
