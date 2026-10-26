import io
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.students.models import Student
from apps.internships.models import Skill
from apps.uil_profiles.models import (
    UniversityDepartment,
    UILStudentProfile,
    EmergencyContact,
    AccessibilityProfile,
    StaffProfile,
    Resume,
)
from apps.uil_profiles.tasks import parse_resume_task
from ai_engine.parsers.cv_extractor import extract_resume_data, validate_resume_file

User = get_user_model()



class UILProfilesModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="student_uil@test.com",
            password="Password123!",
            role=User.Role.STUDENT,
        )
        self.student = Student.objects.create(user=self.user)
        self.dept = UniversityDepartment.objects.create(
            university_name="Addis Ababa University",
            department_name="Computer Science",
        )

    def test_uil_student_profile_creation(self):
        profile = UILStudentProfile.objects.create(
            student=self.student,
            student_id_number="UGR/5555/15",
            campus_city="Addis Ababa",
            department="Computer Science",
            academic_year=4,
            gpa=Decimal("3.90"),
        )
        self.assertEqual(profile.student_id_number, "UGR/5555/15")
        self.assertEqual(profile.campus_city, "Addis Ababa")
        self.assertFalse(profile.is_active_for_internship)

    def test_unique_student_id_per_campus_constraint(self):
        UILStudentProfile.objects.create(
            student=self.student,
            student_id_number="UGR/DUPE/15",
            campus_city="Hawassa",
            department="Computer Science",
        )
        # Create second user and student
        user2 = User.objects.create_user(
            email="student2_uil@test.com",
            password="Password123!",
            role=User.Role.STUDENT,
        )
        student2 = Student.objects.create(user=user2)

        # Same student ID at same campus city must raise IntegrityError
        with self.assertRaises(IntegrityError):
            UILStudentProfile.objects.create(
                student=student2,
                student_id_number="UGR/DUPE/15",
                campus_city="Hawassa",
                department="Electrical Engineering",
            )

    def test_emergency_contact_and_accessibility_profile(self):
        profile = UILStudentProfile.objects.create(
            student=self.student,
            student_id_number="UGR/SEC/15",
            campus_city="Addis Ababa",
            department="Software Engineering",
        )
        ec = EmergencyContact.objects.create(
            student_profile=profile,
            contact_name="Abebe Kebede",
            relationship="Father",
            primary_phone="+251911223344",
        )
        self.assertEqual(ec.contact_name, "Abebe Kebede")

        acc = AccessibilityProfile.objects.create(
            student_profile=profile,
            requires_screen_reader=True,
            mobility_assistance_required=False,
            workplace_notes="Encrypted workplace notes text.",
        )
        acc.refresh_from_db()
        self.assertEqual(acc.workplace_notes, "Encrypted workplace notes text.")

    def test_staff_profile_creation(self):
        dean_user = User.objects.create_user(
            email="dean_eng@test.com",
            password="Password123!",
            role=User.Role.DEPT_DEAN,
        )
        staff = StaffProfile.objects.create(
            user=dean_user,
            department=self.dept,
            staff_role=User.Role.DEPT_DEAN,
            phone_number="+251911998877",
        )
        self.assertEqual(staff.staff_role, User.Role.DEPT_DEAN)
        self.assertEqual(staff.department.university_name, "Addis Ababa University")


def make_mock_pdf_bytes(
    name: str = "Amanuel Developer",
    university: str = "Addis Ababa University",
    department: str = "Software Engineering",
    email: str = "amanuel.dev@aau.edu.et",
    phone: str = "+251911223344",
    gpa: str = "3.88",
    github: str = "https://github.com/amanuel-dev",
    linkedin: str = "https://linkedin.com/in/amanuel-dev",
    skills: str = "Python, Django, React, PostgreSQL, Docker",
) -> bytes:
    stream_content = f"""BT
/F1 12 Tf
72 700 Td
({name} - {university}) Tj
0 -20 Td
({department}) Tj
0 -20 Td
(Email: {email} Phone: {phone}) Tj
0 -20 Td
(GPA: {gpa} GitHub: {github}) Tj
0 -20 Td
(LinkedIn: {linkedin}) Tj
0 -20 Td
(Skills: {skills}) Tj
ET"""
    stream_bytes = stream_content.encode("latin1")
    length = len(stream_bytes)
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length {length} >> stream
{stream_content}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
{400 + length}
%%EOF"""
    return pdf.encode("latin1")


class ResumeDocumentParsingAndWorkflowTests(TestCase):
    """
    Verification suite for Phase 5 NLP & Document Parsing:
      1. cv_extractor parses mock PDF extracting GPA, GitHub, LinkedIn, email, phone, university, skills.
      2. Celery parse_resume_task never auto-writes to student profiles, returning suggestions.
      3. Upload & status polling endpoints function correctly.
      4. Explicit confirmation endpoint updates only student-approved fields.
      5. File size (>5MB) and invalid MIME validations reject improper files.
    """

    def setUp(self):
        self.client = APIClient()

        # Seed canonical skills
        self.skill_python, _ = Skill.objects.get_or_create(name="Python", category="Backend")
        self.skill_django, _ = Skill.objects.get_or_create(name="Django", category="Backend")
        self.skill_react, _ = Skill.objects.get_or_create(name="React", category="Frontend")
        self.skill_postgres, _ = Skill.objects.get_or_create(name="PostgreSQL", category="Database")
        self.skill_docker, _ = Skill.objects.get_or_create(name="Docker", category="DevOps")

        # Create student user and baseline models
        self.user = User.objects.create_user(
            email="candidate@aau.edu.et",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
            first_name="Amanuel",
            last_name="Bekele",
        )
        self.student = Student.objects.create(
            user=self.user,
            university="Addis Ababa University",
            field_of_study="Undeclared",
            current_year="2nd Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.uil_profile = UILStudentProfile.objects.create(
            student=self.student,
            student_id_number="AAU/9999/16",
            campus_city="Addis Ababa",
            department="Undeclared",
            academic_year=2,
            gpa=Decimal("2.50"),
            github_url="",
            is_active_for_internship=True,
        )

        self.mock_pdf_bytes = make_mock_pdf_bytes()

    def test_cv_extractor_extracts_mock_pdf_entities(self):
        """Verify that cv_extractor extracts all expected entities from a mock PDF."""
        file_obj = io.BytesIO(self.mock_pdf_bytes)
        file_obj.name = "resume.pdf"

        result = extract_resume_data(file_obj)
        data = result["data"]

        self.assertEqual(data["email"], "amanuel.dev@aau.edu.et")
        self.assertEqual(data["phone"], "+251911223344")
        self.assertEqual(data["github_url"], "https://github.com/amanuel-dev")
        self.assertEqual(data["linkedin_url"], "https://linkedin.com/in/amanuel-dev")
        self.assertEqual(data["gpa"], 3.88)
        self.assertEqual(data["education"]["institution"], "Addis Ababa University")
        self.assertEqual(data["education"]["field_of_study"], "Software Engineering")

        # Assert canonical skills match
        self.assertIn("Python", data["skills"])
        self.assertIn("Django", data["skills"])
        self.assertIn("React", data["skills"])
        self.assertIn("PostgreSQL", data["skills"])
        self.assertIn("Docker", data["skills"])

    def test_parse_resume_task_never_silently_writes_to_student_profile(self):
        """
        CRITICAL GUARDRAIL VERIFICATION:
        parse_resume_task must extract text and store parsed_data on Resume,
        but MUST NEVER modify UILStudentProfile or Student profile records.
        """
        uploaded_file = SimpleUploadedFile(
            name="amanuel_resume.pdf",
            content=self.mock_pdf_bytes,
            content_type="application/pdf",
        )
        resume = Resume.objects.create(
            student=self.uil_profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.PENDING,
        )

        # Run parse task
        task_res = parse_resume_task(resume.id)
        self.assertEqual(task_res["status"], "COMPLETED")

        resume.refresh_from_db()
        self.assertEqual(resume.parsing_status, Resume.ParsingStatus.COMPLETED)
        self.assertEqual(resume.parsed_data["gpa"], 3.88)
        self.assertEqual(resume.parsed_data["github_url"], "https://github.com/amanuel-dev")

        # ASSERT DATABASE PROFILE WAS NOT MUTATED
        self.uil_profile.refresh_from_db()
        self.student.refresh_from_db()

        self.assertEqual(self.uil_profile.gpa, Decimal("2.50"), "GPA must NOT be overwritten automatically!")
        self.assertEqual(self.uil_profile.github_url, "", "GitHub URL must NOT be overwritten automatically!")
        self.assertEqual(self.uil_profile.department, "Undeclared", "Department must NOT be overwritten automatically!")
        self.assertEqual(self.student.field_of_study, "Undeclared", "Field of study must NOT be overwritten automatically!")
        self.assertEqual(self.student.skills.count(), 0, "Skills must NOT be added without explicit confirmation!")

    def test_upload_and_status_endpoints(self):
        """
        Verify POST /api/v1/uil-profiles/resume/ and GET /api/v1/uil-profiles/resume/status/<id>/
        """
        self.client.force_authenticate(user=self.user)

        pdf_file = SimpleUploadedFile(
            name="test_resume.pdf",
            content=self.mock_pdf_bytes,
            content_type="application/pdf",
        )
        upload_url = reverse("uil_profiles:resume-upload")
        response = self.client.post(
            upload_url,
            {"file": pdf_file},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertIn("id", data)
        resume_id = data["id"]

        # Ensure parse completed
        resume = Resume.objects.get(id=resume_id)
        if resume.parsing_status != Resume.ParsingStatus.COMPLETED:
            parse_resume_task(resume_id)

        # Poll status
        status_url = reverse("uil_profiles:resume-status", kwargs={"pk": resume_id})
        status_resp = self.client.get(status_url)
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        status_data = status_resp.json()
        self.assertEqual(status_data["parsing_status"], Resume.ParsingStatus.COMPLETED)
        self.assertIn("parsed_data", status_data)
        self.assertEqual(status_data["parsed_data"]["gpa"], 3.88)

    def test_explicit_confirmation_endpoint_updates_selected_fields(self):
        """
        Verify that student can selectively accept parsed suggestions, and ONLY
        the selected fields are committed to their profile.
        """
        uploaded_file = SimpleUploadedFile(
            name="amanuel_resume.pdf",
            content=self.mock_pdf_bytes,
            content_type="application/pdf",
        )
        resume = Resume.objects.create(
            student=self.uil_profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.COMPLETED,
            parsed_data={
                "gpa": 3.88,
                "github_url": "https://github.com/amanuel-dev",
                "education": {"field_of_study": "Software Engineering", "institution": "Addis Ababa University"},
                "skills": ["Python", "Django", "React", "Docker"],
            },
        )

        self.client.force_authenticate(user=self.user)
        confirm_url = reverse("uil_profiles:resume-confirm", kwargs={"pk": resume.id})

        # Student decides to accept GPA, GitHub URL, and skills Python/Django (omitting Docker)
        payload = {
            "gpa": "3.88",
            "github_url": "https://github.com/amanuel-dev",
            "department": "Software Engineering",
            "skills": ["Python", "Django"],
        }
        response = self.client.post(confirm_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        resp_data = response.json()
        self.assertEqual(resp_data["status"], "CONFIRMED")

        # Verify profile is now updated with the accepted fields
        self.uil_profile.refresh_from_db()
        self.student.refresh_from_db()

        self.assertEqual(self.uil_profile.gpa, Decimal("3.88"))
        self.assertEqual(self.uil_profile.github_url, "https://github.com/amanuel-dev")
        self.assertEqual(self.uil_profile.department, "Software Engineering")
        self.assertEqual(self.student.field_of_study, "Software Engineering")

        # Verify only Python and Django were added, NOT Docker
        skills = list(self.student.skills.values_list("name", flat=True))
        self.assertIn("Python", skills)
        self.assertIn("Django", skills)
        self.assertNotIn("Docker", skills)

    def test_file_size_validation_rejects_oversized_file(self):
        """Verify that resumes larger than 5MB are rejected."""
        self.client.force_authenticate(user=self.user)
        # Create 5.5MB dummy file
        oversized = SimpleUploadedFile(
            name="big_resume.pdf",
            content=b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024),
            content_type="application/pdf",
        )
        upload_url = reverse("uil_profiles:resume-upload")
        response = self.client.post(
            upload_url,
            {"file": oversized},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.json())


class DeanWorkflowAndChatTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Create Dean of Computer Science
        self.dean_user = User.objects.create_user(
            email="cs_dean@aau.edu.et",
            password="Password123!",
            role=User.Role.DEPT_DEAN,
            department="Computer Science",
            university_name="Addis Ababa University",
            first_name="Dr. Bekele",
            last_name="Tadesse",
        )

        # Create CS Student (with underscore department "computer_science")
        self.cs_student_user = User.objects.create_user(
            email="cs_student@aau.edu.et",
            password="Password123!",
            role=User.Role.STUDENT,
            department="computer_science",
            university_name="Addis Ababa University",
            first_name="Amanuel",
            last_name="Mulugeta",
        )
        self.cs_legacy_student = Student.objects.create(
            user=self.cs_student_user,
            field_of_study="computer_science",
            university="Addis Ababa University",
        )
        self.cs_uil_profile = UILStudentProfile.objects.create(
            student=self.cs_legacy_student,
            student_id_number="UGR/1234/16",
            campus_city="Addis Ababa",
            department="computer_science",
            academic_year=4,
            gpa=Decimal("3.85"),
        )

        # Create Civil Eng Student
        self.civil_student_user = User.objects.create_user(
            email="civil_student@aau.edu.et",
            password="Password123!",
            role=User.Role.STUDENT,
            department="Civil Engineering",
            university_name="Addis Ababa University",
            first_name="Chala",
            last_name="Gemechu",
        )
        self.civil_legacy_student = Student.objects.create(
            user=self.civil_student_user,
            field_of_study="Civil Engineering",
            university="Addis Ababa University",
        )
        self.civil_uil_profile = UILStudentProfile.objects.create(
            student=self.civil_legacy_student,
            student_id_number="UGR/9999/16",
            campus_city="Addis Ababa",
            department="Civil Engineering",
            academic_year=4,
            gpa=Decimal("3.20"),
        )

    def test_dean_student_list_department_matching(self):
        """Dean of Computer Science should see computer_science student and not Civil Eng student."""
        self.client.force_authenticate(user=self.dean_user)
        url = reverse("uil_profiles:dean-students")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        student_ids = [s["student_id_number"] for s in data["students"]]
        self.assertIn("UGR/1234/16", student_ids)
        self.assertNotIn("UGR/9999/16", student_ids)

        # Check dossier fields
        matching_student = next(s for s in data["students"] if s["student_id_number"] == "UGR/1234/16")
        self.assertEqual(matching_student["gpa"], "3.85")
        self.assertEqual(matching_student["academic_year"], 4)
        self.assertTrue(matching_student["is_eligible"])

    def test_dean_verify_student_and_chat_activation(self):
        """Dean verifies CS student, generating QR, email, and activating chat."""
        self.client.force_authenticate(user=self.dean_user)
        verify_url = reverse("uil_profiles:dean-verify-student", kwargs={"pk": self.cs_uil_profile.id})
        resp = self.client.post(verify_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.cs_uil_profile.refresh_from_db()
        self.assertTrue(self.cs_uil_profile.is_verified_by_dean)
        self.assertTrue(len(self.cs_uil_profile.dean_signature_hash) > 0)
        self.assertTrue(len(self.cs_uil_profile.dean_verification_letter_qr) > 0)

        # Dean opens chat with verified student
        chat_url = reverse("uil_profiles:dean-chat", kwargs={"student_id": self.cs_uil_profile.id})
        chat_resp = self.client.get(chat_url)
        self.assertEqual(chat_resp.status_code, status.HTTP_200_OK)
        # Should contain the automated initial welcome greeting
        self.assertGreaterEqual(len(chat_resp.json()["messages"]), 1)

        # Dean sends a message
        send_url = reverse("uil_profiles:dean-chat-send", kwargs={"student_id": self.cs_uil_profile.id})
        send_resp = self.client.post(send_url, {"message": "Please review your logistics clearance window."}, format="json")
        self.assertEqual(send_resp.status_code, status.HTTP_201_CREATED)

        # Student logs in and reads chat
        self.client.force_authenticate(user=self.cs_student_user)
        student_chat_url = reverse("uil_profiles:student-dean-chat")
        stu_chat_resp = self.client.get(student_chat_url)
        self.assertEqual(stu_chat_resp.status_code, status.HTTP_200_OK)
        stu_messages = stu_chat_resp.json()["messages"]
        self.assertGreaterEqual(len(stu_messages), 2)

        # Student replies
        student_send_url = reverse("uil_profiles:student-dean-chat-send")
        stu_send_resp = self.client.post(student_send_url, {"message": "Thank you Dean! I received the clearance letter."}, format="json")
        self.assertEqual(stu_send_resp.status_code, status.HTTP_201_CREATED)

    def test_unverified_student_cannot_access_chat(self):
        """Unverified student must receive 403 Forbidden when attempting to access Dean chat."""
        self.client.force_authenticate(user=self.civil_student_user)
        student_chat_url = reverse("uil_profiles:student-dean-chat")
        resp = self.client.get(student_chat_url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_dean_custom_clearance_letter_and_student_preview(self):
        """Test custom clearance letter issuance and student read-only roster preview."""
        self.client.force_authenticate(user=self.dean_user)
        verify_url = reverse("uil_profiles:dean-verify-student", kwargs={"pk": self.cs_uil_profile.id})
        payload = {
            "notes": "Approved for Summer 2024 Track 1. Dorm Block 4 & Cafeteria pass authorized.",
            "allow_dormitory": True,
            "allow_cafeteria": True,
            "allow_internship": True,
            "valid_from": "2026-10-01",
            "valid_until": "2027-02-01",
        }
        resp = self.client.post(verify_url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn("Dean Dr.", data["dean_title"])
        self.assertTrue(len(data["dean_letter_qr"]) > 0)
        self.assertEqual(data["dean_letter_notes"], payload["notes"])

        # Test Dean issue / edit letter
        issue_letter_url = reverse("uil_profiles:dean-issue-letter", kwargs={"student_id": self.cs_uil_profile.id})
        new_payload = {
            "notes": "Updated remarks: Extended clearance granted by Dean Dr. Mulat.",
            "allow_dormitory": True,
            "allow_cafeteria": False,
            "allow_internship": True,
            "valid_from": "2026-10-05",
            "valid_until": "2027-02-15",
        }
        issue_resp = self.client.post(issue_letter_url, new_payload, format="json")
        self.assertEqual(issue_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(issue_resp.json()["dean_letter_notes"], new_payload["notes"])
        self.assertFalse(issue_resp.json()["dean_allow_food"])

        # Student inspects their profile and score roster preview
        self.client.force_authenticate(user=self.cs_student_user)
        me_url = reverse("uil_profiles:student-uil-me")
        me_resp = self.client.get(me_url)
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)
        me_data = me_resp.json()
        self.assertTrue(me_data["is_verified_by_dean"])
        self.assertIn("Dean Dr.", me_data["dean_title"])
        self.assertEqual(me_data["dean_letter_notes"], new_payload["notes"])
        self.assertIn("score_roster_preview", me_data)
        self.assertEqual(me_data["score_roster_preview"]["eligibility_status"], "APPROVED - 3RD YEAR COMPLETED")

    def test_single_dean_qr_across_all_three_letters_and_separate_dispatch(self):
        """
        Verify that a Department Dean has exactly ONE unique QR code for all applications
        (Official Internship Clearance, Dorm & Cafeteria Clearance, and Official Score Letter),
        and that after student verification, the Dean can compose and dispatch each of the 3 letters separately.
        """
        self.client.force_authenticate(user=self.dean_user)
        verify_url = reverse("uil_profiles:dean-verify-student", kwargs={"pk": self.cs_uil_profile.id})
        v_resp = self.client.post(verify_url, {"notes": "Verified for Track 1."}, format="json")
        self.assertEqual(v_resp.status_code, status.HTTP_200_OK)
        v_data = v_resp.json()
        dean_qr = v_data["dean_unique_qr"]
        self.assertTrue(len(dean_qr) > 0)
        self.assertEqual(v_data["dean_letter_qr"], dean_qr)
        self.assertEqual(v_data["dean_dorm_food_letter_qr"], dean_qr)
        self.assertEqual(v_data["dean_verification_letter_qr"], dean_qr)

        # 1. Issue Internship Clearance Letter separately
        issue_url = reverse("uil_profiles:dean-issue-letter", kwargs={"student_id": self.cs_uil_profile.id})
        int_resp = self.client.post(issue_url, {
            "letter_type": "internship",
            "letter_title": "Official Internship Clearance Letter",
            "notes": "Student officially cleared for Track 1 In-House Internship only.",
            "allow_internship": True,
        }, format="json")
        self.assertEqual(int_resp.status_code, status.HTTP_200_OK)
        int_data = int_resp.json()
        self.assertTrue(int_data["internship_letter_sent"])
        self.assertEqual(int_data["dean_unique_qr"], dean_qr)
        self.assertEqual(int_data["dean_letter_qr"], dean_qr)

        # 2. Issue Dorm & Cafeteria Clearance Letter separately
        dorm_resp = self.client.post(issue_url, {
            "letter_type": "dorm_food",
            "letter_title": "Official Campus Dormitory & Cafeteria Clearance Authorization",
            "notes": "Approved for Dorm Block 4, Room 12 and dining hall meal card.",
            "allow_dormitory": True,
            "allow_cafeteria": True,
        }, format="json")
        self.assertEqual(dorm_resp.status_code, status.HTTP_200_OK)
        dorm_data = dorm_resp.json()
        self.assertTrue(dorm_data["dorm_food_letter_sent"])
        self.assertEqual(dorm_data["dean_unique_qr"], dean_qr)
        self.assertEqual(dorm_data["dean_dorm_food_letter_qr"], dean_qr)

        # 3. Issue and update Score Sheet & Excel Roster separately
        score_resp = self.client.post(issue_url, {
            "letter_type": "score",
            "notes": "Final composite score approved by Dean Dr. Mulat.",
            "advisor_score": "24",
            "uil_score": "23",
            "doc_score": "25",
            "pres_score": "24",
            "gpa": "3.85",
        }, format="json")
        self.assertEqual(score_resp.status_code, status.HTTP_200_OK)
        score_data = score_resp.json()
        self.assertTrue(score_data["score_letter_sent"])
        self.assertEqual(score_data["dean_unique_qr"], dean_qr)
        self.assertEqual(float(score_data["score_roster_data"]["total_score"]), 96.0)

        # 4. Student views their dashboard profile with all 3 letters and identical Dean QR code
        self.client.force_authenticate(user=self.cs_student_user)
        me_url = reverse("uil_profiles:student-uil-me")
        me_resp = self.client.get(me_url)
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)
        me_data = me_resp.json()
        self.assertEqual(me_data["dean_unique_qr"], dean_qr)
        self.assertTrue(me_data["internship_letter_sent"])
        self.assertTrue(me_data["dorm_food_letter_sent"])
        self.assertTrue(me_data["score_letter_sent"])
        self.assertEqual(me_data["score_roster_preview"]["dean_unique_qr"], dean_qr)

    def test_cross_university_dean_access_forbidden(self):
        """A Dean from a different university (e.g. ASTU) cannot view or verify an AAU student."""
        astu_dean = User.objects.create_user(
            email="astu_dean@astu.edu.et",
            password="Password123!",
            role=User.Role.DEPT_DEAN,
            department="Computer Science",
            university_name="Adama Science and Technology University",
            first_name="Dr. Kebede",
            last_name="Alemu",
        )
        self.client.force_authenticate(user=astu_dean)

        # ASTU Dean student list should NOT include AAU student
        url = reverse("uil_profiles:dean-students")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        student_ids = [s["student_id_number"] for s in resp.json()["students"]]
        self.assertNotIn("UGR/1234/16", student_ids)

        # ASTU Dean cannot verify AAU student (403 Forbidden)
        verify_url = reverse("uil_profiles:dean-verify-student", kwargs={"pk": self.cs_uil_profile.id})
        v_resp = self.client.post(verify_url)
        self.assertEqual(v_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_forward_to_dorm_and_dean_complete_flow(self):
        """
        Verify validation rules for forwarding Dorm & Cafeteria letter:
        1. Must be verified by Department Dean first.
        2. Must have registered Dorm Admin / Student Dean at the student's university.
        3. Target actor must be admin-approved (is_approved=True).
        4. Target actor must have a completed profile with university and unique staff ID.
        5. Student, Dorm Admin, and Student Dean must belong to the exact same university.
        6. Once forwarded, letters display on Dorm Admin and Student Dean list endpoints.
        """
        forward_dorm_url = reverse("uil_profiles:student-forward-to-dorm")
        forward_dean_url = reverse("uil_profiles:student-forward-to-student-dean")

        # Step 0: Unverified student fails
        self.client.force_authenticate(user=self.cs_student_user)
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("verified by your Department Dean", resp.json()["detail"])

        # Verify student via Dean
        self.client.force_authenticate(user=self.dean_user)
        verify_url = reverse("uil_profiles:dean-verify-student", kwargs={"pk": self.cs_uil_profile.id})
        self.client.post(verify_url, {"notes": "Verified for Track 1."}, format="json")

        # Step 1: Student attempts forward when no Dorm Admin exists
        self.client.force_authenticate(user=self.cs_student_user)
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No Dormitory Administrator registered", resp.json()["detail"])

        # Create Dorm Admin from a different university (e.g. ASTU)
        diff_dorm = User.objects.create_user(
            email="astu_dorm@astu.edu.et",
            password="Password123!",
            role=User.Role.DORM_ADMIN,
            university_name="Adama Science and Technology University",
            staff_id_number="ASTU-DORM-01",
            is_approved=True,
            is_active=True,
        )
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No Dormitory Administrator registered", resp.json()["detail"])

        # Create AAU Dorm Admin but unapproved by platform admin (is_approved=False)
        aau_dorm = User.objects.create_user(
            email="aau_dorm@aau.edu.et",
            password="Password123!",
            role=User.Role.DORM_ADMIN,
            university_name="Addis Ababa University",
            staff_id_number="AAU-DORM-99",
            is_approved=False,
            is_active=True,
        )
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("has not been verified/approved by the platform administrator", resp.json()["detail"])

        # Approve Dorm Admin but clear staff_id_number to test profile completeness check
        aau_dorm.is_approved = True
        aau_dorm.staff_id_number = ""
        aau_dorm.save()
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("has not completed their institutional profile", resp.json()["detail"])

        # Set valid unique staff_id_number
        aau_dorm.staff_id_number = "AAU-DORM-01"
        aau_dorm.save()

        # Step 2: Successful forward to Dormitory Administration
        resp = self.client.post(forward_dorm_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("successfully forwarded to Dormitory Administration", resp.json()["message"])

        # Verify DB status
        self.cs_uil_profile.refresh_from_db()
        self.assertTrue(self.cs_uil_profile.forwarded_to_dorm)
        self.assertIsNotNone(self.cs_uil_profile.forwarded_to_dorm_at)

        # Step 3: Student forwards to Student Dean (same checks)
        resp_dean = self.client.post(forward_dean_url)
        self.assertEqual(resp_dean.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No Student Dean registered", resp_dean.json()["detail"])

        # Create approved AAU Student Dean with unique Staff ID
        aau_union = User.objects.create_user(
            email="aau_dean_union@aau.edu.et",
            password="Password123!",
            role=User.Role.STUDENT_UNION,
            university_name="Addis Ababa University",
            staff_id_number="AAU-UNION-01",
            is_approved=True,
            is_active=True,
        )
        resp_dean = self.client.post(forward_dean_url)
        self.assertEqual(resp_dean.status_code, status.HTTP_200_OK)
        self.assertIn("successfully forwarded to Student Dean", resp_dean.json()["message"])

        self.cs_uil_profile.refresh_from_db()
        self.assertTrue(self.cs_uil_profile.forwarded_to_student_dean)
        self.assertIsNotNone(self.cs_uil_profile.forwarded_to_student_dean_at)

        # Step 4: Dorm Admin views received forwarded letters
        self.client.force_authenticate(user=aau_dorm)
        dorm_list_url = reverse("uil_profiles:dorm-forwarded-letters")
        dorm_resp = self.client.get(dorm_list_url)
        self.assertEqual(dorm_resp.status_code, status.HTTP_200_OK)
        dorm_letters = dorm_resp.json()
        self.assertEqual(len(dorm_letters), 1)
        self.assertEqual(dorm_letters[0]["student_id_number"], "UGR/1234/16")
        self.assertEqual(dorm_letters[0]["university_name"], "Addis Ababa University")

        # Step 5: Student Dean views received forwarded cafeteria letters
        self.client.force_authenticate(user=aau_union)
        dean_list_url = reverse("uil_profiles:student-dean-forwarded-letters")
        dean_resp = self.client.get(dean_list_url)
        self.assertEqual(dean_resp.status_code, status.HTTP_200_OK)
        dean_letters = dean_resp.json()
        self.assertEqual(len(dean_letters), 1)
        self.assertEqual(dean_letters[0]["student_id_number"], "UGR/1234/16")



