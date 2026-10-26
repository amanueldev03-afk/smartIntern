from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.internships.models import Skill
from apps.students.models import Student
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import InHouseCohort, ProjectTeam, TeamMember, WeeklyLogbook, LogbookAlert
from apps.teams.tasks import verify_logbook_task
from apps.teams.services.balancer import balance_inhouse_teams
from ai_engine.services.plagiarism import check_logbook_plagiarism

User = get_user_model()

# 300-word software task description (Frontend & Web engineering)
ENTRY_FRONTEND_REACT_300_WORDS = (
    "During this week of the software engineering internship, my primary responsibility was architecting "
    "and implementing the responsive student dashboard utilizing React, TypeScript, and Tailwind CSS. "
    "I initiated the development process by structuring reusable modular components including dynamic navigation bars, "
    "interactive analytics summary cards, and asynchronous application status tables. To optimize client-side "
    "state management, I integrated Redux Toolkit along with createAsyncThunk for handling API pagination, "
    "asynchronous data retrieval, and error boundaries. Special emphasis was placed on network efficiency; "
    "hence, I configured client-side caching strategies and implemented a custom debounce hook for real-time search inputs, "
    "reducing unnecessary network roundtrips to the backend API by forty percent. Furthermore, I authored comprehensive "
    "unit test suites using Vitest and React Testing Library, achieving eighty-five percent code coverage across "
    "critical UI components and mocking network responses via Mock Service Worker. I collaborated closely with the UX "
    "design team in Figma to adhere strictly to accessible color contrasts, keyboard navigation guidelines, and mobile "
    "viewports down to 320px width. In addition to frontend development, I resolved cross-origin resource sharing (CORS) "
    "headers during local testing with the Django backend and established automated linting rules using ESLint and Prettier "
    "within our GitHub Actions continuous integration pipeline. Finally, I participated in daily standup meetings, "
    "conducted peer code reviews on pull requests, documented component props in Storybook, and prepared a live demonstration "
    "for company stakeholders showcasing the complete student application workflow and real-time status notifications."
)

# 300-word distinct software task description (Embedded systems & Firmware)
ENTRY_EMBEDDED_C_300_WORDS = (
    "This week's engineering effort concentrated on low-level bare-metal firmware programming for the STM32 "
    "microcontroller platform targeting industrial IoT sensor nodes. I developed device drivers in embedded C "
    "to interface with environmental sensors measuring temperature, humidity, and barometric pressure over the I2C "
    "and SPI hardware buses. To ensure deterministic execution without blocking the main CPU loop, I configured "
    "Direct Memory Access (DMA) circular buffers and interrupt service routines for UART serial telemetry. "
    "Additionally, I integrated FreeRTOS as the real-time operating system kernel, partitioning system responsibilities "
    "into distinct priority-based tasks including sensor acquisition, local non-volatile flash logging, and power "
    "management. I calibrated hardware timer peripherals for pulse-width modulation (PWM) motor control and analyzed "
    "analog sensor signals using the internal twelve-bit analog-to-digital converter (ADC) with hardware oversampling. "
    "To maximize operational battery lifespan in remote deployment environments, I designed a deep sleep power sequence "
    "utilizing the microcontroller's low-power stop mode, achieving an average quiescent current draw of twelve microamperes. "
    "System validation was conducted utilizing an oscilloscope and digital logic analyzer to diagnose bus contention "
    "and verify signal integrity on clock lines. All firmware routines were compiled with arm-none-eabi-gcc, static "
    "analysis was enforced via cppcheck, and memory footprint was optimized to fit within thirty-two kilobytes of internal SRAM."
)


class WeeklyLogbookPlagiarismTests(APITestCase):
    """
    Verification suite for Phase 6 Academic Integrity / Plagiarism:
      - check_logbook_plagiarism(new_text, student_id)
      - Two identical 300-word entries -> second flags with score > 90%.
      - A distinct entry -> stays strictly below 75%.
      - verify_logbook_task updates similarity_score, is_flagged, and dispatches alerts.
    """

    def setUp(self):
        self.student_1 = User.objects.create_user(
            email="student_1@aau.edu.et",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            first_name="Abebe",
            last_name="Bikila",
        )
        self.student_2 = User.objects.create_user(
            email="student_2@aau.edu.et",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            first_name="Derartu",
            last_name="Tulu",
        )
        self.student_3 = User.objects.create_user(
            email="student_3@aau.edu.et",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            first_name="Haile",
            last_name="Gebrselassie",
        )
        self.advisor = User.objects.create_user(
            email="advisor_logbook@aau.edu.et",
            password="StrongPassword123!",
            role=User.Role.ADVISOR,
            first_name="Dr. Dawit",
            last_name="Zewdu",
        )
        self.mentor = User.objects.create_user(
            email="mentor_logbook@telecom.et",
            password="StrongPassword123!",
            role=User.Role.COMPANY_MENTOR,
            first_name="Sara",
            last_name="Kebede",
        )

        self.base_s1 = Student.objects.create(
            user=self.student_1,
            university="Addis Ababa University",
            field_of_study="Software Engineering",
            current_year="4th Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.uil_s1 = UILStudentProfile.objects.create(
            student=self.base_s1,
            student_id_number="AAU/001/16",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=4,
            gpa=Decimal("3.80"),
            is_active_for_internship=True,
        )

        self.base_s2 = Student.objects.create(
            user=self.student_2,
            university="Addis Ababa University",
            field_of_study="Software Engineering",
            current_year="4th Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.uil_s2 = UILStudentProfile.objects.create(
            student=self.base_s2,
            student_id_number="AAU/002/16",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=4,
            gpa=Decimal("3.70"),
            is_active_for_internship=True,
        )

        self.base_s3 = Student.objects.create(
            user=self.student_3,
            university="Addis Ababa University",
            field_of_study="Software Engineering",
            current_year="4th Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.uil_s3 = UILStudentProfile.objects.create(
            student=self.base_s3,
            student_id_number="AAU/003/16",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=4,
            gpa=Decimal("3.60"),
            is_active_for_internship=True,
        )

        # Baseline: Student 1 submits Week 1 logbook with React description, approved by Advisor
        self.approved_logbook = WeeklyLogbook.objects.create(
            student=self.uil_s1,
            academic_advisor=self.advisor,
            company_mentor=self.mentor,
            week_number=1,
            tasks_planned="Build frontend student dashboard",
            tasks_executed=ENTRY_FRONTEND_REACT_300_WORDS,
            challenges_faced="CORS setup and client caching",
            git_commit_urls=["https://github.com/intern/project/commit/initial123"],
            similarity_score=Decimal("0.0"),
            is_flagged=False,
            advisor_approved=True,  # Part of historical approved corpus
        )

    def test_two_identical_300_word_entries_flags_above_90_percent(self):
        """
        Verify requirement:
        Two identical 300-word entries -> second flags with score > 90%.
        """
        score, is_flagged, snippet = check_logbook_plagiarism(
            new_text=ENTRY_FRONTEND_REACT_300_WORDS,
            student_id=str(self.uil_s2.id),
        )

        self.assertGreater(
            score,
            90.0,
            f"Expected score > 90%, got {score}%",
        )
        self.assertTrue(is_flagged, "Submission must be flagged when score >= 75.0%")
        self.assertTrue(len(snippet) > 0, "Matched snippet must not be empty")

    def test_distinct_entry_stays_below_75_percent(self):
        """
        Verify requirement:
        A distinct entry -> stays below 75%.
        """
        score, is_flagged, snippet = check_logbook_plagiarism(
            new_text=ENTRY_EMBEDDED_C_300_WORDS,
            student_id=str(self.uil_s3.id),
        )

        self.assertLess(
            score,
            75.0,
            f"Expected score < 75%, got {score}%",
        )
        self.assertFalse(is_flagged, "Distinct entry must NOT be flagged")

    def test_verify_logbook_task_persists_score_and_dispatches_alerts(self):
        """
        Verify verify_logbook_task:
        Computes and stores similarity_score and is_flagged;
        if flagged, notifies the assigned Advisor and Company Mentor.
        """
        # Student 2 submits identical 300-word logbook
        logbook_2 = WeeklyLogbook.objects.create(
            student=self.uil_s2,
            academic_advisor=self.advisor,
            company_mentor=self.mentor,
            week_number=1,
            tasks_planned="Frontend development",
            tasks_executed=ENTRY_FRONTEND_REACT_300_WORDS,
            challenges_faced="None",
            git_commit_urls=["https://github.com/copycat/repo/commit/456def"],
            similarity_score=Decimal("0.0"),
            is_flagged=False,
            advisor_approved=False,
        )

        task_result = verify_logbook_task(str(logbook_2.id))
        self.assertEqual(task_result["status"], "completed")

        logbook_2.refresh_from_db()
        self.assertGreater(float(logbook_2.similarity_score), 90.0)
        self.assertTrue(logbook_2.is_flagged)
        self.assertTrue(len(logbook_2.matched_snippet) > 0)

        # Assert notifications/alerts created for Advisor and Mentor
        alerts = LogbookAlert.objects.filter(logbook=logbook_2)
        self.assertEqual(alerts.count(), 2)

        recipients = set(alerts.values_list("recipient__email", flat=True))
        self.assertIn(self.advisor.email, recipients)
        self.assertIn(self.mentor.email, recipients)

    def test_student_own_earlier_entry_same_week_excluded(self):
        """
        Verify that student's own earlier entry for the same week is excluded
        from triggering a self-plagiarism flag.
        """
        # Student 1 checks an update to their own entry for week 1
        score, is_flagged, snippet = check_logbook_plagiarism(
            new_text=ENTRY_FRONTEND_REACT_300_WORDS,
            student_id=str(self.student_1.id),
            week_number=1,
        )

        self.assertEqual(score, 0.0)
        self.assertFalse(is_flagged)


class InHouseTeamFormationAndGateTests(APITestCase):
    """
    Verification suite for Phase 7 Campus Software House & Balanced Team Formation:
      1. 15 seeded students -> 3 balanced 5-person teams (~2 Frontend, ~2 Backend, ~1 DevOps/QA).
      2. Exactly one leader designated per squad.
      3. Documentation gate: Weekly logbook submission returns HTTP 403 when srs_status != 'APPROVED'.
      4. SRS approval unlocks weekly logbook submission returning HTTP 201.
      5. SRS rejection sets 2-week revision deadline and stores advisor feedback.
    """

    def setUp(self):
        # 1. Skills setup
        self.skill_react, _ = Skill.objects.get_or_create(name="React", category="Frontend")
        self.skill_flutter, _ = Skill.objects.get_or_create(name="Flutter", category="Frontend")
        self.skill_typescript, _ = Skill.objects.get_or_create(name="TypeScript", category="Frontend")

        self.skill_python, _ = Skill.objects.get_or_create(name="Python", category="Backend")
        self.skill_django, _ = Skill.objects.get_or_create(name="Django", category="Backend")
        self.skill_postgres, _ = Skill.objects.get_or_create(name="PostgreSQL", category="Backend")

        self.skill_docker, _ = Skill.objects.get_or_create(name="Docker", category="DevOps")
        self.skill_k8s, _ = Skill.objects.get_or_create(name="Kubernetes", category="DevOps")
        self.skill_figma, _ = Skill.objects.get_or_create(name="Figma", category="Design")

        # 2. Advisor setup
        self.advisor = User.objects.create_user(
            email="advisor_squad@aau.edu.et",
            password="Password123!",
            role=User.Role.ADVISOR,
            first_name="Dr. Solomon",
            last_name="Girma",
        )

        # 3. Create InHouseCohort
        self.cohort = InHouseCohort.objects.create(
            university_name="Addis Ababa University",
            academic_year="4th Year",
            start_date=timezone.now().date(),
            end_date=(timezone.now() + timezone.timedelta(days=120)).date(),
            capacity_k=15,
            is_open=True,
        )

        # 4. Seed 15 Students:
        # - 6 Frontend-oriented (React, TypeScript)
        # - 6 Backend-oriented (Python, Django, PostgreSQL)
        # - 3 DevOps/UI-UX-oriented (Docker, Figma)
        self.students = []
        for i in range(1, 16):
            user = User.objects.create_user(
                email=f"intern_{i}@aau.edu.et",
                password="Password123!",
                role=User.Role.STUDENT,
                first_name=f"Student{i}",
                last_name="AAU",
            )
            base_student = Student.objects.create(
                user=user,
                university="Addis Ababa University",
                field_of_study="Software Engineering",
                current_year="4th Year",
                preferred_city="Addis Ababa",
                work_mode="onsite",
            )
            gpa = Decimal(f"{3.00 + (i * 0.05):.2f}")
            uil = UILStudentProfile.objects.create(
                student=base_student,
                student_id_number=f"AAU/{i:03d}/16",
                campus_city="Addis Ababa",
                department="Software Engineering",
                academic_year=4,
                gpa=gpa,
                is_active_for_internship=True,
            )

            # Assign skills
            if i <= 6:
                base_student.skills.add(self.skill_react, self.skill_typescript)
            elif i <= 12:
                base_student.skills.add(self.skill_python, self.skill_django, self.skill_postgres)
            else:
                base_student.skills.add(self.skill_docker, self.skill_figma)

            self.cohort.accepted_students.add(uil)
            self.students.append((user, base_student, uil))

    def test_balance_inhouse_teams_forms_three_balanced_five_person_squads(self):
        """
        Verify: 15 seeded students -> 3 balanced 5-person teams (~2 frontend, ~2 backend, ~1 devops).
        """
        teams = balance_inhouse_teams(self.cohort.id, squad_size=5)
        self.assertEqual(len(teams), 3, "Expected exactly 3 squads from 15 students")

        for team in teams:
            members = team.members.all()
            self.assertEqual(members.count(), 5, "Each squad must contain exactly 5 members")

            # Check leaders: exactly 1 leader per squad
            leaders = members.filter(is_leader=True)
            self.assertEqual(leaders.count(), 1, "Each squad must have exactly 1 designated leader")

            # Check balance
            frontend_count = members.filter(role="Frontend/Mobile").count()
            backend_count = members.filter(role="Backend/API").count()
            devops_count = members.filter(role="DevOps-QA/UI-UX").count()

            self.assertEqual(frontend_count, 2, "Each squad should have 2 Frontend members")
            self.assertEqual(backend_count, 2, "Each squad should have 2 Backend members")
            self.assertEqual(devops_count, 1, "Each squad should have 1 DevOps/QA member")

    def test_documentation_gate_locks_and_unlocks_weekly_logbook(self):
        """
        Verify:
          - Weekly-log endpoint returns 403 while srs_status != APPROVED.
          - Rejection opens a 2-week revision deadline with advisor feedback.
          - Weekly-log endpoint returns 201 after SRS is approved.
        """
        teams = balance_inhouse_teams(self.cohort.id, squad_size=5)
        team = teams[0]
        team.assigned_advisor = self.advisor
        team.save()

        # Find first student member in this team
        member_student_user = team.members.first().student.student.user
        self.client.force_authenticate(user=member_student_user)

        logbook_url = reverse("teams:logbook-list-create")
        payload = {
            "week_number": 1,
            "tasks_planned": "Setup initial repository",
            "tasks_executed": "Cloned repo and verified local environment",
            "challenges_faced": "None",
        }

        # 1. Team SRS is currently DRAFT -> MUST RETURN 403 FORBIDDEN
        resp_draft = self.client.post(logbook_url, payload, format="json")
        self.assertEqual(
            resp_draft.status_code,
            status.HTTP_403_FORBIDDEN,
            "Submission must be blocked with HTTP 403 when SRS status is DRAFT",
        )
        self.assertIn("Documentation Gate Locked", resp_draft.json().get("detail", ""))

        # 2. Advisor reviews and REJECTS with feedback
        self.client.force_authenticate(user=self.advisor)
        review_url = reverse("teams:team-srs-review", kwargs={"team_id": team.id})
        resp_reject = self.client.post(
            review_url,
            {"action": "reject", "feedback": "Architecture diagram missing database schema specifications."},
            format="json",
        )
        self.assertEqual(resp_reject.status_code, status.HTTP_200_OK)

        team.refresh_from_db()
        self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.REJECTED)
        self.assertIsNotNone(team.srs_revision_deadline)
        # Verify 2-week deadline (approx 14 days)
        delta = team.srs_revision_deadline - timezone.now()
        self.assertGreaterEqual(delta.days, 13)
        self.assertIn("Architecture diagram missing", team.srs_feedback)

        # 3. Student tries again while REJECTED -> MUST STILL RETURN 403 FORBIDDEN
        self.client.force_authenticate(user=member_student_user)
        resp_rejected = self.client.post(logbook_url, payload, format="json")
        self.assertEqual(resp_rejected.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Advisor reviews and APPROVES
        self.client.force_authenticate(user=self.advisor)
        resp_approve = self.client.post(
            review_url,
            {"action": "approve", "feedback": "Architecture diagrams updated and verified. Proceed to coding."},
            format="json",
        )
        self.assertEqual(resp_approve.status_code, status.HTTP_200_OK)

        team.refresh_from_db()
        self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.APPROVED)
        self.assertTrue(team.is_coding_unlocked)

        # 5. Student submits weekly logbook -> MUST RETURN 201 CREATED
        self.client.force_authenticate(user=member_student_user)
        resp_approved = self.client.post(logbook_url, payload, format="json")
        self.assertEqual(
            resp_approved.status_code,
            status.HTTP_201_CREATED,
            "Submission must succeed with HTTP 201 after SRS is approved",
        )
        data = resp_approved.json()
        self.assertEqual(data["week_number"], 1)
        self.assertEqual(data["tasks_planned"], "Setup initial repository")

