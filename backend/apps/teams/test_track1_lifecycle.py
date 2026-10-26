import uuid
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.accounts.models import User
from apps.internships.models import Internship, Skill
from apps.companies.models import Company, CompanyStudentInvitation
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import InHouseCohort, ProjectTeam, TeamMember, InternshipProgram, TeamChannelMessage
from apps.logistics.models import CampusLogistics
from apps.students.models import Student


class Track1FullLifecycleTestCase(TestCase):
    """
    Comprehensive End-to-End Test Suite for the complete Track 1 Lifecycle
    spanning all 8 platform actors.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Platform Administrator
        self.admin = User.objects.create_superuser(
            email="admin@smartintern.et",
            password="AdminPassword123!",
            first_name="System",
            last_name="Admin",
        )

        # 2. Company HR & Company
        self.company = Company.objects.create(
            name="Ethio Telecom Tech",
            website="https://ethiotelecom.et",
            country="Ethiopia",
            industry="Telecommunications",
        )
        self.company_hr = User.objects.create_user(
            email="hr@ethiotelecom.et",
            password="HrPassword123!",
            role=User.Role.COMPANY_HR,
            first_name="Almaz",
            last_name="Kebede",
        )
        self.company_hr.is_email_verified = True
        self.company_hr.save()

        # 3. Department Dean (Software Engineering)
        self.dean = User.objects.create_user(
            email="dean.se@aau.edu.et",
            password="DeanPassword123!",
            role=User.Role.DEPT_DEAN,
            first_name="Dr. Bekele",
            last_name="Tadesse",
            department="Software Engineering",
            university_name="Addis Ababa University",
        )
        self.dean.is_email_verified = True
        # Starts unapproved by default for institutional staff
        self.dean.is_approved = False
        self.dean.save()

        # 4. UIL Officer
        self.uil_officer = User.objects.create_user(
            email="uil@aau.edu.et",
            password="UilPassword123!",
            role=User.Role.UIL_OFFICER,
            first_name="Tewodros",
            last_name="Mulugeta",
            university_name="Addis Ababa University",
        )
        self.uil_officer.is_email_verified = True
        self.uil_officer.is_approved = False
        self.uil_officer.save()

        # 5. Academic Advisor
        self.advisor = User.objects.create_user(
            email="advisor@aau.edu.et",
            password="AdvisorPassword123!",
            role=User.Role.ADVISOR,
            first_name="Prof. Solomon",
            last_name="Girma",
            department="Software Engineering",
        )
        self.advisor.is_email_verified = True
        self.advisor.is_approved = False
        self.advisor.save()

        # 6. Student Union Officer
        self.student_union = User.objects.create_user(
            email="union@aau.edu.et",
            password="UnionPassword123!",
            role=User.Role.STUDENT_UNION,
            first_name="Yonas",
            last_name="Haile",
        )
        self.student_union.is_email_verified = True
        self.student_union.is_approved = False
        self.student_union.save()

        # 7. Dormitory Admin
        self.dorm_admin = User.objects.create_user(
            email="dorm@aau.edu.et",
            password="DormPassword123!",
            role=User.Role.DORM_ADMIN,
            first_name="Marta",
            last_name="Assefa",
        )
        self.dorm_admin.is_email_verified = True
        self.dorm_admin.is_approved = False
        self.dorm_admin.save()

        # 8. Students
        # Eligible student: Year 4 (completed 3rd year)
        self.student_user_eligible = User.objects.create_user(
            email="student.year4@aau.edu.et",
            password="StudentPassword123!",
            role=User.Role.STUDENT,
            first_name="Abebe",
            last_name="Bikila",
        )
        self.student_user_eligible.is_email_verified = True
        self.student_user_eligible.save()
        self.legacy_student_eligible = Student.objects.create(
            user=self.student_user_eligible,
            university="Addis Ababa University",
            field_of_study="Software Engineering",
            current_year="4th Year",
        )
        self.uil_student_eligible = UILStudentProfile.objects.create(
            student=self.legacy_student_eligible,
            student_id_number="UGR/1234/13",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=4,
            gpa=Decimal("3.85"),
            is_active_for_internship=True,
        )

        # Ineligible student: Year 3 (has NOT completed 3rd year)
        self.student_user_ineligible = User.objects.create_user(
            email="student.year3@aau.edu.et",
            password="StudentPassword123!",
            role=User.Role.STUDENT,
            first_name="Dawit",
            last_name="Chernet",
        )
        self.student_user_ineligible.is_email_verified = True
        self.student_user_ineligible.save()
        self.legacy_student_ineligible = Student.objects.create(
            user=self.student_user_ineligible,
            university="Addis Ababa University",
            field_of_study="Software Engineering",
            current_year="3rd Year",
        )
        self.uil_student_ineligible = UILStudentProfile.objects.create(
            student=self.legacy_student_ineligible,
            student_id_number="UGR/5678/14",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=3,
            gpa=Decimal("3.50"),
            is_active_for_internship=True,
        )

        # Skills
        self.skill_react = Skill.objects.create(name="React.js", category="Frontend")
        self.skill_django = Skill.objects.create(name="Django", category="Backend")
        self.skill_docker = Skill.objects.create(name="Docker", category="DevOps")
        self.legacy_student_eligible.skills.add(self.skill_react, self.skill_django)

    def test_01_institutional_staff_approval_workflow(self):
        """Test approval gates for staff and advisors."""
        # Unapproved Dean login fails with HTTP 403
        resp = self.client.post("/api/auth/login/", {"email": self.dean.email, "password": "DeanPassword123!"})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("pending institutional administrator approval", str(resp.data))

        # Admin approves Dean
        self.client.force_authenticate(user=self.admin)
        pending_resp = self.client.get("/api/v1/auth/admin/pending-staff/")
        self.assertEqual(pending_resp.status_code, status.HTTP_200_OK)
        
        approve_resp = self.client.post(f"/api/v1/auth/admin/approve-staff/{self.dean.id}/")
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.dean.refresh_from_db()
        self.assertTrue(self.dean.is_approved)

        # Approve UIL Officer, Union, Dorm Admin
        self.client.post(f"/api/v1/auth/admin/approve-staff/{self.uil_officer.id}/")
        self.client.post(f"/api/v1/auth/admin/approve-staff/{self.student_union.id}/")
        self.client.post(f"/api/v1/auth/admin/approve-staff/{self.dorm_admin.id}/")

        # Now Dean logs in successfully
        self.client.logout()
        login_resp = self.client.post("/api/auth/login/", {"email": self.dean.email, "password": "DeanPassword123!"})
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(login_resp.data["user"]["role"], "dept_dean")

        # Unapproved Advisor login fails
        adv_login = self.client.post("/api/auth/login/", {"email": self.advisor.email, "password": "AdvisorPassword123!"})
        self.assertEqual(adv_login.status_code, status.HTTP_403_FORBIDDEN)

        # UIL Officer approves Academic Advisor
        self.client.force_authenticate(user=self.uil_officer)
        uil_approve = self.client.post(f"/api/v1/auth/uil/approve-advisor/{self.advisor.id}/")
        self.assertEqual(uil_approve.status_code, status.HTTP_200_OK)
        self.advisor.refresh_from_db()
        self.assertTrue(self.advisor.is_approved)

    def test_02_company_posting_admin_publish_ai_matching_and_chat(self):
        """Test Company creates internship, Admin publishes it, and AI matching + direct chat."""
        # 1. Company HR posts an internship
        self.client.force_authenticate(user=self.company_hr)
        create_resp = self.client.post(
            "/api/companies/my-internships/",
            {
                "title": "Full-Stack Software Engineering Intern",
                "organization_name": "Ethio Telecom",
                "description": "Building next-gen digital financial services with React and Django.",
                "category": "Software Engineering",
                "internship_type": "onsite",
                "work_type": "full_time",
                "required_skills": [self.skill_react.id, self.skill_django.id],
                "application_url": "https://ethiotelecom.et/apply",
            },
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        internship_id = create_resp.data["id"]
        internship = Internship.objects.get(id=internship_id)
        # Gated: is_published is False
        self.assertFalse(internship.is_published)

        # 2. Student CANNOT view unpublished internship
        self.client.force_authenticate(user=self.student_user_eligible)
        list_resp = self.client.get("/api/internships/")
        self.assertNotIn(internship_id, [item["id"] for item in list_resp.data.get("results", [])])

        # 3. Admin reviews and publishes the internship
        self.client.force_authenticate(user=self.admin)
        publish_resp = self.client.post(f"/api/internships/admin/{internship_id}/publish/", {"publish": True})
        self.assertEqual(publish_resp.status_code, status.HTTP_200_OK)
        internship.refresh_from_db()
        self.assertTrue(internship.is_published)

        # 4. Student can now see the published internship
        self.client.force_authenticate(user=self.student_user_eligible)
        list_resp2 = self.client.get("/api/internships/")
        self.assertIn(internship_id, [item["id"] for item in list_resp2.data.get("results", [])])

        # 5. Company views AI Recommended Students
        self.client.force_authenticate(user=self.company_hr)
        rec_resp = self.client.get(f"/api/companies/internships/{internship_id}/recommended-students/")
        self.assertEqual(rec_resp.status_code, status.HTTP_200_OK)
        recs = rec_resp.data["recommendations"]
        self.assertGreater(len(recs), 0)
        top_student = recs[0]
        self.assertEqual(top_student["student_id_number"], "UGR/1234/13")
        self.assertGreater(top_student["match_score"], 80.0)

        # 6. Company invites student
        invite_resp = self.client.post(
            "/api/companies/invitations/",
            {
                "internship_id": internship_id,
                "student_id": str(self.uil_student_eligible.id),
                "requirements_note": "Please join us for an initial technical interview.",
            },
        )
        self.assertEqual(invite_resp.status_code, status.HTTP_201_CREATED)
        invitation_id = invite_resp.data["id"]

        # 7. Student views invitations and accepts
        self.client.force_authenticate(user=self.student_user_eligible)
        stu_invites = self.client.get("/api/companies/student/invitations/")
        self.assertEqual(stu_invites.status_code, status.HTTP_200_OK)
        
        accept_resp = self.client.post(f"/api/companies/student/invitations/{invitation_id}/respond/", {"action": "accept"})
        self.assertEqual(accept_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_resp.data["invitation"]["status"], "ACCEPTED")

        # 8. Direct chat between Student and Company is active
        chat_resp = self.client.get(f"/api/companies/chat/{invitation_id}/")
        self.assertEqual(chat_resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(chat_resp.data), 1)

        send_chat = self.client.post(
            f"/api/companies/chat/{invitation_id}/send/",
            {"message": "Thank you! Here is my availability for the interview.", "meet_url": "https://meet.google.com/abc-test"},
        )
        self.assertEqual(send_chat.status_code, status.HTTP_201_CREATED)

    def test_03_dean_scoped_verification_eligibility_and_qr_letters(self):
        """Test Dean scoped filtering, strict 3rd year completion rule, QR letters, and Excel roster generation."""
        self.dean.is_approved = True
        self.dean.save()
        self.client.force_authenticate(user=self.dean)

        # 1. Dean views students in their department
        resp = self.client.get("/api/v1/uil-profiles/dean/students/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        students = resp.data["students"]
        student_ids = [s["student_id_number"] for s in students]
        self.assertIn("UGR/1234/13", student_ids)
        self.assertIn("UGR/5678/14", student_ids)

        # 2. Ineligible student (Year 3) verification fails
        fail_verify = self.client.post(f"/api/v1/uil-profiles/dean/verify-student/{self.uil_student_ineligible.id}/")
        self.assertEqual(fail_verify.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Academic Year must be 4 or higher", fail_verify.data["detail"])

        # 3. Eligible student (Year 4) verification succeeds
        success_verify = self.client.post(f"/api/v1/uil-profiles/dean/verify-student/{self.uil_student_eligible.id}/")
        self.assertEqual(success_verify.status_code, status.HTTP_200_OK)
        self.assertIn("data:image/png;base64,", success_verify.data["dean_verification_letter_qr"])
        self.assertIn("data:image/png;base64,", success_verify.data["dean_dorm_food_letter_qr"])
        self.assertIsNotNone(success_verify.data["roster_download_url"])

        self.uil_student_eligible.refresh_from_db()
        self.assertTrue(self.uil_student_eligible.is_verified_by_dean)

        # 4. Student forwards verified documents to UIL Officer
        self.client.force_authenticate(user=self.student_user_eligible)
        fwd_resp = self.client.post("/api/v1/uil-profiles/student/forward-to-uil/")
        self.assertEqual(fwd_resp.status_code, status.HTTP_200_OK)
        self.uil_student_eligible.refresh_from_db()
        self.assertTrue(self.uil_student_eligible.forwarded_to_uil)

    def test_04_student_union_and_dorm_admin_logistics_clearance(self):
        """Test Student Union meal card with Base64 QR code and Dorm Admin room assignment and checkout."""
        # Precondition: Dean verified
        self.uil_student_eligible.is_verified_by_dean = True
        self.uil_student_eligible.save()
        cohort = InHouseCohort.objects.create(
            university_name="Addis Ababa University",
            academic_year="4",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timezone.timedelta(days=120),
            capacity_k=50,
        )
        logistics = CampusLogistics.objects.create(
            student=self.uil_student_eligible,
            cohort=cohort,
            dean_approved=True,
            dean_signature_hash="mock_signature_hash_dean",
        )

        # 1. Student Union issues meal card with appointment
        self.student_union.is_approved = True
        self.student_union.save()
        self.client.force_authenticate(user=self.student_union)
        meal_resp = self.client.post(
            f"/api/v1/logistics/{logistics.id}/activate-meal-card/",
            {
                "meal_card_number": "MC-2026-9999",
                "meal_card_appointment": timezone.now().isoformat(),
            },
        )
        self.assertEqual(meal_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(meal_resp.data["meal_card_active"])
        self.assertIn("data:image/png;base64,", meal_resp.data["student_union_qr_code"])

        # 2. Dorm Admin checks room grid (6-8 beds) and assigns bed
        self.dorm_admin.is_approved = True
        self.dorm_admin.save()
        self.client.force_authenticate(user=self.dorm_admin)
        grid_resp = self.client.get("/api/v1/logistics/dorm-rooms/")
        self.assertEqual(grid_resp.status_code, status.HTTP_200_OK)

        assign_resp = self.client.post(
            f"/api/v1/logistics/{logistics.id}/assign-dorm/",
            {
                "dorm_block": "Block 12",
                "dorm_room": "304",
                "dorm_bed_number": "Bed 2",
                "issue_key": True,
            },
        )
        self.assertEqual(assign_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(assign_resp.data["key_issued"])

        # 3. Student exit checkout checkbox
        checkout_resp = self.client.post(f"/api/v1/logistics/{logistics.id}/checkout/", {"checkout": True})
        self.assertEqual(checkout_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(checkout_resp.data["room_checkout"])
        self.assertTrue(checkout_resp.data["cleared_at_exit"])

    def test_05_squad_formation_timers_verification_seal_and_composite_grading(self):
        """Test full squad lifecycle: timers, multi-channel chat, advisor verification, UIL QR seal, and Dean final grading."""
        self.uil_officer.is_approved = True
        self.uil_officer.save()
        self.advisor.is_approved = True
        self.advisor.save()
        self.dean.is_approved = True
        self.dean.save()

        # 1. UIL Officer manages program and creates cohort squad
        self.client.force_authenticate(user=self.uil_officer)
        prog_resp = self.client.post(
            "/api/v1/teams/programs/",
            {
                "name": "Summer 2026 Campus Software House",
                "target_quota": 40,
                "description": "National digital infrastructure projects.",
            },
        )
        self.assertEqual(prog_resp.status_code, status.HTTP_201_CREATED)

        cohort = InHouseCohort.objects.create(
            university_name="Addis Ababa University",
            academic_year="4",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + timezone.timedelta(days=120),
            capacity_k=40,
        )
        team = ProjectTeam.objects.create(
            cohort=cohort,
            team_name="Squad Alpha",
            project_title="National Logistics Portal",
            assigned_advisor=self.advisor,
            documentation_deadline=timezone.now() + timezone.timedelta(days=14),
        )
        TeamMember.objects.create(team=team, student=self.uil_student_eligible, is_leader=True, role="Frontend Lead")

        # 2. Multi-channel chat: Squad Internal and Squad + Advisor (with Google Meet URL)
        self.client.force_authenticate(user=self.student_user_eligible)
        chat1 = self.client.post(
            f"/api/v1/teams/{team.id}/messages/send/",
            {
                "channel_type": "SQUAD_INTERNAL",
                "message": "Team, let's complete the architecture diagrams today.",
            },
        )
        self.assertEqual(chat1.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.advisor)
        chat2 = self.client.post(
            f"/api/v1/teams/{team.id}/messages/send/",
            {
                "channel_type": "SQUAD_ADVISOR",
                "message": "Weekly advisory sync is starting now.",
                "meet_url": "https://meet.google.com/xyz-advisory-squad",
            },
        )
        self.assertEqual(chat2.status_code, status.HTTP_201_CREATED)
        team.refresh_from_db()
        self.assertEqual(team.google_meet_url, "https://meet.google.com/xyz-advisory-squad")

        # 3. Documentation countdown submission
        self.client.force_authenticate(user=self.student_user_eligible)
        doc_resp = self.client.post(f"/api/v1/teams/{team.id}/submit-documentation/")
        self.assertEqual(doc_resp.status_code, status.HTTP_200_OK)

        # 4. UIL Officer reviews documentation -> approves -> unlocks implementation countdown timer
        self.client.force_authenticate(user=self.uil_officer)
        review_doc = self.client.post(
            f"/api/v1/teams/{team.id}/review-documentation/",
            {"action": "approve", "comments": "Excellent SRS. Proceed to coding.", "implementation_days": 45},
        )
        self.assertEqual(review_doc.status_code, status.HTTP_200_OK)
        team.refresh_from_db()
        self.assertIsNotNone(team.implementation_deadline)

        # 5. Student submits implementation code
        self.client.force_authenticate(user=self.student_user_eligible)
        impl_resp = self.client.post(
            f"/api/v1/teams/{team.id}/submit-implementation/",
            {"implementation_repo_url": "https://github.com/aau-uil/national-logistics-portal"},
        )
        self.assertEqual(impl_resp.status_code, status.HTTP_200_OK)

        # 6. Advisor verifies implementation, ratings & score (out of 25)
        self.client.force_authenticate(user=self.advisor)
        adv_verify = self.client.post(
            f"/api/v1/teams/{team.id}/advisor-verify/",
            {"rating": 4.9, "score": 24.5, "notes": "Production-grade code quality and full test coverage."},
        )
        self.assertEqual(adv_verify.status_code, status.HTTP_200_OK)

        # 7. UIL Officer inputs UIL score (out of 25) and seals score sheet with Base64 QR code
        self.client.force_authenticate(user=self.uil_officer)
        seal_resp = self.client.post(
            f"/api/v1/teams/{team.id}/uil-score-seal/",
            {"uil_score": 24.0},
        )
        self.assertEqual(seal_resp.status_code, status.HTTP_200_OK)
        team.refresh_from_db()
        self.assertTrue(team.uil_score_sealed)
        self.assertIn("data:image/png;base64,", team.uil_score_sheet_qr)

        # 8. Dean unseals score sheet, schedules defense, and computes final composite grade (100%)
        self.client.force_authenticate(user=self.dean)
        unseal_resp = self.client.post(f"/api/v1/uil-profiles/dean/unseal-score-sheet/{team.id}/")
        self.assertEqual(unseal_resp.status_code, status.HTTP_200_OK)

        defense_resp = self.client.post(
            f"/api/v1/uil-profiles/dean/schedule-defense/{team.id}/",
            {
                "defense_scheduled_at": timezone.now().isoformat(),
                "venue": "Faculty of Technology Boardroom",
                "meet_url": "https://meet.google.com/defense-live",
            },
        )
        self.assertEqual(defense_resp.status_code, status.HTTP_200_OK)

        final_grade_resp = self.client.post(
            f"/api/v1/uil-profiles/dean/submit-final-grade/{team.id}/",
            {"documentation_score": 23.5, "presentation_score": 24.0},
        )
        self.assertEqual(final_grade_resp.status_code, status.HTTP_200_OK)
        breakdown = final_grade_resp.data["breakdown"]
        self.assertEqual(Decimal(breakdown["final_composite_score_100"]), Decimal("96.0"))
        self.assertEqual(breakdown["final_grade_letter"], "A+")
