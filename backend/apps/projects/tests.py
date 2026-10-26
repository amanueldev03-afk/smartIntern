import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects.models import WeeklyLogbook, LogbookAlert
from apps.projects.tasks import verify_logbook_task
from ai_engine.services.plagiarism import check_logbook_plagiarism

User = get_user_model()

# 300-word software task description (Frontend & Web engineering)
DESCRIPTION_FRONTEND_REACT = (
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

# 300-word completely distinct software task description (Embedded systems & Firmware)
DESCRIPTION_EMBEDDED_C = (
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


class PlagiarismDetectorUnitTests(APITestCase):
    """
    Unit and integration tests for the n-gram TF-IDF plagiarism detector pipeline.
    """

    def setUp(self):
        # Create users
        self.student_a = User.objects.create_user(
            email="student_a@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
            first_name="Abebe",
            last_name="Bikila",
            is_active=True,
        )
        self.student_b = User.objects.create_user(
            email="student_b@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
            first_name="Derartu",
            last_name="Tulu",
            is_active=True,
        )
        self.student_c = User.objects.create_user(
            email="student_c@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
            first_name="Haile",
            last_name="Gebrselassie",
            is_active=True,
        )
        self.advisor = User.objects.create_user(
            email="advisor@aau.edu.et",
            password="Password123!",
            role=User.Role.ADVISOR,
            first_name="Dr. Dawit",
            last_name="Zewdu",
            is_active=True,
        )
        self.mentor = User.objects.create_user(
            email="mentor@company.com",
            password="Password123!",
            role=User.Role.COMPANY_MENTOR,
            first_name="Sara",
            last_name="Kebede",
            is_active=True,
        )

        # Baseline: Student A submits week 1 logbook with React description, and Advisor approves it
        self.logbook_a = WeeklyLogbook.objects.create(
            student=self.student_a,
            academic_advisor=self.advisor,
            company_mentor=self.mentor,
            week_number=1,
            tasks_planned="Build student dashboard UI",
            tasks_executed=DESCRIPTION_FRONTEND_REACT,
            challenges_faced="Handling CORS and state synchronization",
            git_commit_urls=["https://github.com/intern/project/commit/abc1234"],
            similarity_score=Decimal("0.0"),
            is_flagged=False,
            advisor_approved=True,  # Part of the historical approved corpus
            advisor_feedback="Well-written detailed report.",
        )

    def test_identical_300_word_logbook_flagged_above_90_percent(self):
        """
        Verify: Submitting two identical 300-word software task descriptions
        causes the system to flag the second submission with a similarity score > 90%,
        sets is_flagged=True, and dispatches in-app alerts to both Academic Advisor
        and Company Mentor.
        """
        # Student B submits the exact same 300-word description
        logbook_b = WeeklyLogbook.objects.create(
            student=self.student_b,
            academic_advisor=self.advisor,
            company_mentor=self.mentor,
            week_number=1,
            tasks_planned="Frontend dashboard development",
            tasks_executed=DESCRIPTION_FRONTEND_REACT,
            challenges_faced="None",
            git_commit_urls=["https://github.com/copycat/project/commit/xyz789"],
            similarity_score=Decimal("0.0"),
            is_flagged=False,
            advisor_approved=False,
        )

        # Run asynchronous verification task
        task_result = verify_logbook_task(str(logbook_b.id))
        self.assertEqual(task_result["status"], "completed")

        logbook_b.refresh_from_db()

        # 1. Similarity score must exceed 90.0%
        self.assertGreater(
            float(logbook_b.similarity_score),
            90.0,
            f"Expected similarity score > 90%, got {logbook_b.similarity_score}%",
        )

        # 2. Must be flagged as plagiarized
        self.assertTrue(logbook_b.is_flagged)

        # 3. Matched snippet must contain historical excerpt
        self.assertTrue(len(logbook_b.matched_snippet) > 0)

        # 4. In-app alerts must be dispatched to Academic Advisor and Company Mentor
        alerts = LogbookAlert.objects.filter(logbook=logbook_b)
        self.assertEqual(alerts.count(), 2)

        recipients = set(alerts.values_list("recipient__email", flat=True))
        self.assertIn(self.advisor.email, recipients)
        self.assertIn(self.mentor.email, recipients)

        advisor_alert = alerts.filter(recipient=self.advisor).first()
        self.assertIn("Plagiarism Alert", advisor_alert.title)
        self.assertEqual(advisor_alert.alert_type, LogbookAlert.AlertType.PLAGIARISM_FLAGGED)
        self.assertFalse(advisor_alert.is_read)

    def test_distinct_description_not_flagged_below_75_percent(self):
        """
        Verify: Submitting a distinct description confirms the similarity score
        remains strictly below the 75% threshold, is_flagged remains False,
        and no alerts are dispatched.
        """
        # Student C submits an embedded systems description (completely distinct vocabulary)
        logbook_c = WeeklyLogbook.objects.create(
            student=self.student_c,
            academic_advisor=self.advisor,
            company_mentor=self.mentor,
            week_number=1,
            tasks_planned="STM32 FreeRTOS firmware drivers",
            tasks_executed=DESCRIPTION_EMBEDDED_C,
            challenges_faced="I2C bus arbitration",
            git_commit_urls=["https://github.com/firmware/iot/commit/fff456"],
            similarity_score=Decimal("0.0"),
            is_flagged=False,
            advisor_approved=False,
        )

        # Run verification task
        task_result = verify_logbook_task(str(logbook_c.id))
        self.assertEqual(task_result["status"], "completed")

        logbook_c.refresh_from_db()

        # 1. Similarity score must remain strictly below 75%
        self.assertLess(
            float(logbook_c.similarity_score),
            75.0,
            f"Expected similarity score < 75%, got {logbook_c.similarity_score}%",
        )

        # 2. Must NOT be flagged
        self.assertFalse(logbook_c.is_flagged)

        # 3. No plagiarism alerts dispatched
        alerts = LogbookAlert.objects.filter(logbook=logbook_c)
        self.assertEqual(alerts.count(), 0)

    def test_same_student_same_week_excluded(self):
        """
        Verify: An approved logbook by the SAME student for the SAME week
        is excluded from the comparison, preventing false-positive self-plagiarism
        when updating drafts or re-submitting.
        """
        score, is_flagged, snippet = check_logbook_plagiarism(
            new_text=DESCRIPTION_FRONTEND_REACT,
            student_id=str(self.student_a.id),
            week_number=1,
        )
        self.assertEqual(score, 0.0)
        self.assertFalse(is_flagged)
        self.assertEqual(snippet, "")

    def test_empty_or_whitespace_text_handled_gracefully(self):
        """
        Verify: Empty or whitespace-only logbooks return 0.0% score and unflagged.
        """
        score, is_flagged, snippet = check_logbook_plagiarism(
            new_text="   \n\t  ",
            student_id=str(self.student_b.id),
            week_number=2,
        )
        self.assertEqual(score, 0.0)
        self.assertFalse(is_flagged)
        self.assertEqual(snippet, "")

    def test_api_submit_logbook_and_status_polling(self):
        """
        Verify: POST /api/v1/projects/logbooks/ creates logbook
        and GET /api/v1/projects/logbooks/<id>/ retrieves it.
        """
        self.client.force_authenticate(user=self.student_b)
        url = reverse("projects:logbook-list-create")

        payload = {
            "week_number": 2,
            "tasks_planned": "Implement OAuth2 login flow",
            "tasks_executed": "Built OAuth2 authorization callback handlers and refresh token rotation.",
            "challenges_faced": "Token expiration sync",
            "git_commit_urls": ["https://github.com/repo/commit/123456"],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        logbook_id = response.data["id"]

        # Retrieve logbook detail
        detail_url = reverse("projects:logbook-detail", kwargs={"pk": logbook_id})
        detail_resp = self.client.get(detail_url)
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_resp.data["week_number"], 2)
        self.assertEqual(detail_resp.data["student_email"], self.student_b.email)

    def test_advisor_approval_endpoint(self):
        """
        Verify: PATCH /api/v1/projects/logbooks/<id>/approve/ allows advisor
        to mark approved and submit feedback.
        """
        self.client.force_authenticate(user=self.advisor)
        approve_url = reverse("projects:logbook-approve", kwargs={"pk": self.logbook_a.id})

        payload = {
            "advisor_approved": True,
            "advisor_feedback": "Approved with commendation for thorough test coverage.",
        }
        response = self.client.patch(approve_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["advisor_approved"])
        self.assertEqual(response.data["advisor_feedback"], payload["advisor_feedback"])

    def test_alerts_list_and_mark_read_endpoint(self):
        """
        Verify: GET /api/v1/projects/alerts/ lists alerts for the advisor,
        and PATCH /api/v1/projects/alerts/<id>/read/ marks them as read.
        """
        alert = LogbookAlert.objects.create(
            logbook=self.logbook_a,
            recipient=self.advisor,
            alert_type=LogbookAlert.AlertType.PLAGIARISM_FLAGGED,
            title="Plagiarism Alert Test",
            message="Test message",
            is_read=False,
        )

        self.client.force_authenticate(user=self.advisor)
        list_url = reverse("projects:alert-list")
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        read_url = reverse("projects:alert-mark-read", kwargs={"pk": alert.id})
        mark_read_resp = self.client.patch(read_url, {}, format="json")
        self.assertEqual(mark_read_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(mark_read_resp.data["is_read"])
        alert.refresh_from_db()
        self.assertTrue(alert.is_read)


from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import date, timedelta
from apps.universities.models import InHouseCohort
from apps.accounts.models import StudentProfile
from apps.projects.models import ProjectTeam, TeamMember
from apps.projects.services.balancer import (
    balance_inhouse_teams,
    ROLE_FRONTEND,
    ROLE_BACKEND,
    ROLE_DEVOPS_QA_UX,
)


class Track1InHouseWorkflowTests(APITestCase):
    """
    Tests for Track 1 University In-House Software House workflow:
      1. Automated team formulation & balancer logic (squad size 5: 2 FE, 2 BE, 1 DevOps/QA/UX)
      2. SRS documentation upload and gate enforcement
      3. Advisor rejection with 2-week revision deadline
      4. Advisor approval unlocking weekly logbook submissions and implementation sprint board
    """

    def setUp(self):
        self.advisor = User.objects.create_user(
            email="advisor.track1@aau.edu.et",
            password="Password123!",
            role=User.Role.ADVISOR,
            first_name="Dr. Getachew",
            last_name="Haile",
            is_active=True,
        )
        self.uil_officer = User.objects.create_user(
            email="uil.officer@aau.edu.et",
            password="Password123!",
            role=User.Role.UIL_OFFICER,
            first_name="Ato",
            last_name="Solomon",
            is_active=True,
        )
        self.external_student = User.objects.create_user(
            email="external.student@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
            first_name="Almaz",
            last_name="Ayana",
            is_active=True,
        )

        self.cohort = InHouseCohort.objects.create(
            university_name="Addis Ababa University",
            academic_year="2023/2024",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=120),
            capacity_k=15,
            is_open=True,
        )

        # Diverse skill configurations for 15 students
        # 6 Frontend, 6 Backend, 3 DevOps / QA / UI-UX
        self.student_data = [
            # 6 Frontend candidates
            ("fe1@aau.edu.et", "FE_One", ["React", "TypeScript", "Tailwind CSS"], Decimal("3.85")),
            ("fe2@aau.edu.et", "FE_Two", ["Flutter", "Dart", "Mobile"], Decimal("3.50")),
            ("fe3@aau.edu.et", "FE_Three", ["React", "Next.js", "Frontend"], Decimal("3.20")),
            ("fe4@aau.edu.et", "FE_Four", ["Flutter", "Android", "Mobile"], Decimal("3.70")),
            ("fe5@aau.edu.et", "FE_Five", ["Vue.js", "JavaScript", "Frontend"], Decimal("3.40")),
            ("fe6@aau.edu.et", "FE_Six", ["React Native", "Mobile", "HTML/CSS"], Decimal("3.60")),
            # 6 Backend candidates
            ("be1@aau.edu.et", "BE_One", ["Django", "Python", "PostgreSQL"], Decimal("3.90")),
            ("be2@aau.edu.et", "BE_Two", ["Node.js", "Express", "API"], Decimal("3.65")),
            ("be3@aau.edu.et", "BE_Three", ["FastAPI", "Python", "Postgres"], Decimal("3.35")),
            ("be4@aau.edu.et", "BE_Four", ["Django", "REST", "PostgreSQL"], Decimal("3.80")),
            ("be5@aau.edu.et", "BE_Five", ["Go", "Backend", "SQL"], Decimal("3.55")),
            ("be6@aau.edu.et", "BE_Six", ["Node", "MongoDB", "Backend"], Decimal("3.45")),
            # 3 DevOps / QA / UI-UX candidates
            ("devops1@aau.edu.et", "DevOps_One", ["Docker", "CI/CD", "DevOps"], Decimal("3.60")),
            ("qa1@aau.edu.et", "QA_One", ["QA", "Testing", "Selenium"], Decimal("3.50")),
            ("ux1@aau.edu.et", "UX_One", ["UI/UX", "Figma", "Design"], Decimal("3.75")),
        ]

        self.students = []
        self.profiles = []
        for i, (email, name, skill_tags, gpa) in enumerate(self.student_data):
            user = User.objects.create_user(
                email=email,
                password="Password123!",
                role=User.Role.STUDENT,
                first_name=name,
                is_active=True,
            )
            profile = StudentProfile.objects.create(
                user=user,
                student_id_number=f"AAU/UGR/{1000 + i}/12",
                university_name="Addis Ababa University",
                campus_city="Addis Ababa",
                department="Software Engineering",
                academic_year=4,
                gpa=gpa,
                skill_tags=skill_tags,
                is_active_for_internship=True,
            )
            self.students.append(user)
            self.profiles.append(profile)

        # Accept students into the in-house cohort
        self.cohort.students.add(*self.profiles)

    def test_team_balancer_generates_three_balanced_squads_of_five(self):
        """
        Verify: Seed test database with 15 students with diverse skill tags.
        Run balance_inhouse_teams and verify it generates 3 balanced teams of 5 students,
        each having 2 Frontend, 2 Backend, 1 DevOps/QA/UX, and exactly 1 designated leader.
        """
        teams = balance_inhouse_teams(cohort_id=str(self.cohort.id), squad_size=5)
        self.assertEqual(len(teams), 3)

        self.cohort.refresh_from_db()
        self.assertEqual(self.cohort.enrolled_count, 15)

        for team in teams:
            members = team.members.all()
            self.assertEqual(members.count(), 5)

            fe_count = members.filter(assigned_role=ROLE_FRONTEND).count()
            be_count = members.filter(assigned_role=ROLE_BACKEND).count()
            devops_count = members.filter(assigned_role=ROLE_DEVOPS_QA_UX).count()

            self.assertEqual(fe_count, 2, f"Team {team.team_name} expected 2 Frontend, got {fe_count}")
            self.assertEqual(be_count, 2, f"Team {team.team_name} expected 2 Backend, got {be_count}")
            self.assertEqual(devops_count, 1, f"Team {team.team_name} expected 1 DevOps/QA/UX, got {devops_count}")

            # Exactly 1 leader per squad
            leaders = members.filter(is_leader=True)
            self.assertEqual(leaders.count(), 1, f"Team {team.team_name} must have exactly 1 leader")

            # Check initial SRS state
            self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.DRAFT)
            self.assertTrue(team.channels_active)

    def test_weekly_log_submission_forbidden_when_srs_not_approved(self):
        """
        Verify: Weekly log submission endpoints return HTTP 403 Forbidden
        if srs_status != 'APPROVED' for in-house team members.
        """
        teams = balance_inhouse_teams(cohort_id=str(self.cohort.id), squad_size=5)
        team1 = teams[0]

        student_user = team1.members.first().student.user
        self.client.force_authenticate(user=student_user)

        url = reverse("projects:logbook-list-create")
        payload = {
            "week_number": 1,
            "tasks_planned": "Write initial API endpoints",
            "tasks_executed": "Set up models and database tables.",
            "challenges_faced": "None",
            "git_commit_urls": ["https://github.com/team/repo/commit/111222"],
        }

        # Status is DRAFT -> 403 Forbidden
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("detail", response.data)
        self.assertIn("Documentation (SRS) must be approved", response.data["detail"])

    def test_srs_documentation_gate_lifecycle(self):
        """
        Verify the complete Track 1 SRS gate lifecycle:
          - DRAFT: Coding actions & sprint board locked (403)
          - SUBMITTED: Uploading SRS PDF transitions status to SUBMITTED, still locked (403)
          - REJECTED: Advisor rejects SRS -> sets feedback & 2-week revision deadline, still locked (403)
          - APPROVED: Advisor approves SRS -> unlocks sprint board (200) and coding weekly log submission (201)
        """
        teams = balance_inhouse_teams(cohort_id=str(self.cohort.id), squad_size=5)
        team = teams[0]
        team.assigned_advisor = self.advisor
        team.save()

        student_user = team.members.first().student.user
        self.client.force_authenticate(user=student_user)

        # 1. Sprint board is locked initially
        sprint_url = reverse("projects:team-sprint-board", kwargs={"pk": team.id})
        sprint_resp = self.client.get(sprint_url)
        self.assertEqual(sprint_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(sprint_resp.data.get("unlocked", True))

        # 2. Upload SRS PDF document
        upload_url = reverse("projects:team-srs-upload", kwargs={"pk": team.id})
        dummy_pdf = SimpleUploadedFile(
            "team_srs_spec.pdf",
            b"%PDF-1.4 ... dummy SRS content ... %%EOF",
            content_type="application/pdf",
        )
        upload_resp = self.client.post(upload_url, {"srs_document": dummy_pdf}, format="multipart")
        self.assertEqual(upload_resp.status_code, status.HTTP_200_OK)
        team.refresh_from_db()
        self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.SUBMITTED)

        # Still locked in SUBMITTED state
        logbook_url = reverse("projects:logbook-list-create")
        logbook_payload = {
            "week_number": 1,
            "tasks_planned": "Architecture setup",
            "tasks_executed": "Implemented user auth",
            "challenges_faced": "None",
            "git_commit_urls": ["https://github.com/team/repo/commit/333444"],
        }
        resp_submitted = self.client.post(logbook_url, logbook_payload, format="json")
        self.assertEqual(resp_submitted.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Advisor reviews and marks REJECTED with feedback notes
        self.client.force_authenticate(user=self.advisor)
        review_url = reverse("projects:team-srs-review", kwargs={"pk": team.id})
        reject_payload = {
            "srs_status": ProjectTeam.SRSStatus.REJECTED,
            "srs_feedback": "Please expand the ERD diagram and add data dictionaries.",
        }
        reject_resp = self.client.patch(review_url, reject_payload, format="json")
        self.assertEqual(reject_resp.status_code, status.HTTP_200_OK)

        team.refresh_from_db()
        self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.REJECTED)
        self.assertEqual(team.srs_feedback, reject_payload["srs_feedback"])
        self.assertIsNotNone(team.srs_revision_deadline)
        # Verify ~2-week deadline (between 13 and 15 days)
        deadline_diff = (team.srs_revision_deadline - timezone.now()).days
        self.assertTrue(13 <= deadline_diff <= 15)

        # Student still blocked during revision period
        self.client.force_authenticate(user=student_user)
        resp_rejected = self.client.post(logbook_url, logbook_payload, format="json")
        self.assertEqual(resp_rejected.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Advisor reviews and marks APPROVED
        self.client.force_authenticate(user=self.advisor)
        approve_payload = {
            "srs_status": ProjectTeam.SRSStatus.APPROVED,
            "srs_feedback": "SRS documentation meets institutional quality standards. Approved!",
        }
        approve_resp = self.client.patch(review_url, approve_payload, format="json")
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)

        team.refresh_from_db()
        self.assertEqual(team.srs_status, ProjectTeam.SRSStatus.APPROVED)
        self.assertTrue(team.is_coding_unlocked)
        self.assertIsNone(team.srs_revision_deadline)

        # 5. Sprint board is now unlocked
        self.client.force_authenticate(user=student_user)
        sprint_resp_unlocked = self.client.get(sprint_url)
        self.assertEqual(sprint_resp_unlocked.status_code, status.HTTP_200_OK)
        self.assertTrue(sprint_resp_unlocked.data["unlocked"])
        self.assertEqual(sprint_resp_unlocked.data["srs_status"], "APPROVED")

        # 6. Weekly logbook submission now succeeds
        resp_approved = self.client.post(logbook_url, logbook_payload, format="json")
        self.assertEqual(resp_approved.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_approved.data["week_number"], 1)

    def test_external_student_without_squad_not_blocked(self):
        """
        Verify: Students outside Track 1 (e.g. standard external industry placements)
        can submit weekly logbooks without being blocked by in-house SRS gates.
        """
        self.client.force_authenticate(user=self.external_student)
        url = reverse("projects:logbook-list-create")
        payload = {
            "week_number": 1,
            "tasks_planned": "External company onboarding",
            "tasks_executed": "Configured local environment and reviewed company styleguide.",
            "challenges_faced": "None",
            "git_commit_urls": ["https://github.com/company/repo/commit/ext001"],
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

