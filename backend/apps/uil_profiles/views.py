import logging
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import transaction

from apps.accounts.models import User
from apps.internships.models import Skill
from apps.students.models import Student
from apps.uil_profiles.models import Resume, UILStudentProfile
from apps.uil_profiles.serializers import (
    ResumeUploadSerializer,
    ResumeStatusSerializer,
    ResumeFieldConfirmationSerializer,
)
from apps.uil_profiles.tasks import parse_resume_task

logger = logging.getLogger(__name__)


def _get_or_create_uil_profile_for_user(user: User) -> UILStudentProfile:
    """
    Helper to resolve or instantiate the linked UILStudentProfile for a user.
    """
    student, _ = Student.objects.get_or_create(
        user=user,
        defaults={
            "university": "Addis Ababa University",
            "field_of_study": "Software Engineering",
            "current_year": "3rd Year",
            "preferred_city": "Addis Ababa",
            "work_mode": "onsite",
        },
    )

    if hasattr(student, "uil_student_profile"):
        return student.uil_student_profile

    uid_str = str(user.id).replace("-", "")[:8].upper()
    uil_profile, _ = UILStudentProfile.objects.get_or_create(
        student=student,
        defaults={
            "student_id_number": f"UIL/{uid_str}/16",
            "campus_city": "Addis Ababa",
            "department": student.field_of_study or "Software Engineering",
            "academic_year": 3,
            "is_active_for_internship": True,
        },
    )
    return uil_profile


class ResumeUploadView(APIView):
    """
    POST /api/v1/uil-profiles/resume/

    Uploads a resume file (PDF or DOCX, max 5MB).
    Creates a Resume parsing record and dispatches parse_resume_task asynchronously.

    Guardrail enforcement:
    Does NOT mutate any UILStudentProfile or Student profile fields.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        uil_profile = _get_or_create_uil_profile_for_user(request.user)

        serializer = ResumeUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resume = serializer.save(student=uil_profile)

        # Dispatch async Celery task (with synchronous fallback if broker unavailable)
        try:
            parse_resume_task.delay(resume.id)
        except Exception as exc:
            logger.warning("Celery dispatch failed (%s), running parse synchronously", exc)
            parse_resume_task(resume.id)
            resume.refresh_from_db()

        return Response(
            {
                "id": resume.id,
                "parsing_status": resume.parsing_status,
                "uploaded_at": resume.uploaded_at,
                "message": "Resume uploaded successfully. Parsing in progress.",
            },
            status=status.HTTP_201_CREATED,
        )


class ResumeStatusView(APIView):
    """
    GET /api/v1/uil-profiles/resume/status/<int:pk>/

    Retrieves the parsing status, raw extracted text, and proposed
    parsed_data suggestions for an uploaded resume.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int, *args, **kwargs):
        resume = get_object_or_404(Resume, pk=pk)

        # Authorization: Student owner, or administrative/staff roles
        is_owner = (
            hasattr(resume.student, "student")
            and resume.student.student.user_id == request.user.id
        )
        is_staff_or_admin = (
            request.user.is_staff
            or getattr(request.user, "role", None) in [
                User.Role.ADMIN,
                "ADMIN",
                "ADMINISTRATOR",
                "UIL_OFFICER",
                "ADVISOR",
                "DEPT_DEAN",
            ]
        )

        if not (is_owner or is_staff_or_admin):
            return Response(
                {"detail": "You do not have permission to view this resume parse."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ResumeStatusSerializer(resume)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ResumeConfirmView(APIView):
    """
    POST /api/v1/uil-profiles/resume/confirm/<int:pk>/
    POST /api/v1/uil-profiles/resume/<int:pk>/confirm/

    Applies ONLY the fields explicitly selected and approved by the student
    from the parsed resume suggestions into the student's profile.

    Guardrail enforcement:
    No database profile mutations occur without this explicit confirmation call.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int, *args, **kwargs):
        resume = get_object_or_404(Resume, pk=pk)

        # Authorization: Only the student owner can confirm updates
        if not (
            hasattr(resume.student, "student")
            and resume.student.student.user_id == request.user.id
        ):
            return Response(
                {"detail": "Only the resume owner can confirm profile updates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ResumeFieldConfirmationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        confirmed_data = serializer.validated_data
        updated_fields = []

        student_record = resume.student.student
        uil_profile = resume.student
        user = request.user

        with transaction.atomic():
            # 1. GPA
            if "gpa" in confirmed_data and confirmed_data["gpa"] is not None:
                uil_profile.gpa = confirmed_data["gpa"]
                uil_profile.save(update_fields=["gpa", "updated_at"])
                updated_fields.append("gpa")

            # 2. GitHub URL
            if "github_url" in confirmed_data:
                uil_profile.github_url = confirmed_data["github_url"]
                uil_profile.save(update_fields=["github_url", "updated_at"])
                updated_fields.append("github_url")

            # 3. Department / Field of Study
            if "department" in confirmed_data and confirmed_data["department"]:
                uil_profile.department = confirmed_data["department"]
                uil_profile.save(update_fields=["department", "updated_at"])
                student_record.field_of_study = confirmed_data["department"]
                student_record.save(update_fields=["field_of_study", "updated_at"])
                updated_fields.append("department")

            # 4. University
            if "university" in confirmed_data and confirmed_data["university"]:
                student_record.university = confirmed_data["university"]
                student_record.save(update_fields=["university", "updated_at"])
                updated_fields.append("university")

            # 5. Phone Number
            if "phone_number" in confirmed_data and confirmed_data["phone_number"]:
                user.phone_number = confirmed_data["phone_number"]
                user.save(update_fields=["phone_number", "updated_at"])
                updated_fields.append("phone_number")

            # 6. Skills
            if "skills" in confirmed_data and confirmed_data["skills"]:
                skill_names = confirmed_data["skills"]
                matched_skills = Skill.objects.filter(name__in=skill_names)
                student_record.skills.add(*matched_skills)
                updated_fields.append("skills")

        return Response(
            {
                "status": "CONFIRMED",
                "message": "Selected resume fields applied successfully to your profile.",
                "updated_fields": updated_fields,
            },
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Track 1 Department Dean Verification, QR Letters, Defense & Grading Views
# =============================================================================

import hmac
import hashlib
import json
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from django.db.models import Q, Count
from apps.accounts.permissions import IsDeptDean, IsStudent, IsDormAdmin, IsStudentUnion, IsLogisticsAdmin, IsUILOfficer
from apps.common.qr_generator import generate_base64_qr
from apps.common.excel_generator import generate_dean_score_roster_template
import datetime
from apps.logistics.models import CampusLogistics
from apps.teams.models import ProjectTeam, InHouseCohort, TeamChannelMessage
from apps.uil_profiles.utils import (
    departments_match,
    normalize_department_name,
    format_dean_title,
    get_or_create_dean_qr_code,
    universities_match,
    normalize_university_name,
    get_user_university,
    get_user_department,
    get_student_profile_university,
    get_student_profile_department,
)
from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from drf_spectacular.utils import extend_schema


@extend_schema(tags=["Department Dean"])
class DeanStudentListView(APIView):
    """
    Scoped view: Department Dean views students belonging to their department.
    Uses normalized department matching and returns full student academic & personal dossier.
    Enforces eligibility flag (3rd year completed: academic_year >= 4).
    GET /api/v1/uil-profiles/dean/students/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def get(self, request):
        # Ensure any student profiles have their UILStudentProfile synced
        from apps.students.models import StudentProfile
        from apps.students.serializers import sync_student_to_uil_profile
        for sp in StudentProfile.objects.select_related("user").all():
            try:
                sync_student_to_uil_profile(sp)
            except Exception as e:
                logger.debug("Auto sync student profile to UIL error: %s", e)

        dean = request.user
        dean_dept = get_user_department(dean)
        dean_univ = get_user_university(dean)

        qs = UILStudentProfile.objects.select_related("student__user").prefetch_related("student__skills").all()

        students_data = []
        for stu in qs.order_by("-academic_year", "-created_at"):
            user = getattr(stu, "user", None)
            sp = getattr(user, "student_profile", None) if user else None
            stu_dept = get_student_profile_department(stu)
            stu_univ = get_student_profile_university(stu)

            # Robust department AND university matching between Student and Dean
            dept_matches = (
                departments_match(stu_dept, dean_dept)
                or (user and departments_match(getattr(user, "department", ""), dean_dept))
                or (sp and departments_match(getattr(sp, "field_of_study", ""), dean_dept))
            )
            univ_matches = universities_match(stu_univ, dean_univ)

            if not (dept_matches and univ_matches):
                continue

            is_eligible = (stu.academic_year >= 4)
            full_name = ""
            if user:
                full_name = f"{user.first_name} {user.last_name}".strip() or user.username
            if not full_name:
                full_name = stu.student_id_number or "Student Intern"

            # Extract student skills
            skills_list = []
            if hasattr(stu.student, "skills"):
                skills_list = [s.name for s in stu.student.skills.all()]
            if not skills_list and sp and hasattr(sp, "skills"):
                skills_list = [
                    s.skill.name if hasattr(s, "skill") else str(s)
                    for s in sp.skills.all()
                ]

            # Extract emergency contact details
            ec_data = None
            if hasattr(stu, "emergency_contact"):
                try:
                    ec = stu.emergency_contact
                    if ec:
                        ec_data = {
                            "contact_name": ec.contact_name,
                            "relationship": ec.relationship,
                            "primary_phone": ec.primary_phone,
                            "insurance_policy_number": ec.insurance_policy_number,
                        }
                except Exception:
                    pass

            # Extract campus logistics info
            logistics_data = None
            try:
                logistics = CampusLogistics.objects.filter(student=stu).first()
                if logistics:
                    logistics_data = {
                        "dean_approved": logistics.dean_approved,
                        "meal_card_number": logistics.meal_card_number,
                        "meal_card_active": logistics.meal_card_active,
                        "dorm_block": logistics.dorm_block,
                        "dorm_room": logistics.dorm_room,
                        "valid_from": str(logistics.valid_from) if logistics.valid_from else None,
                        "valid_until": str(logistics.valid_until) if logistics.valid_until else None,
                    }
            except Exception:
                pass

            students_data.append({
                "id": str(stu.id),
                "student_id_number": stu.student_id_number,
                "full_name": full_name,
                "email": user.email if user else "",
                "phone": getattr(user, "phone_number", "") or (sp.phone if sp else "") or "",
                "university_name": getattr(user, "university_name", "") or (sp.university if sp else "") or stu.campus_city or "Addis Ababa University",
                "department": stu.department,
                "campus_city": stu.campus_city,
                "academic_year": stu.academic_year,
                "gpa": str(stu.gpa) if stu.gpa else None,
                "bio": sp.bio if sp else "",
                "skills": skills_list,
                "interests": sp.interests if sp and hasattr(sp, "interests") else [],
                "github_url": stu.github_url or (sp.github_url if sp else ""),
                "linkedin_url": sp.linkedin_url if sp else "",
                "is_eligible": is_eligible,
                "eligibility_reason": "3rd Year Completed (Year 4+)" if is_eligible else "Ineligible: Must complete 3rd Year (Year 4+ required)",
                "is_verified_by_dean": stu.is_verified_by_dean,
                "dean_verified_at": stu.dean_verified_at.isoformat() if stu.dean_verified_at else None,
                "dean_letter_title": stu.dean_letter_title,
                "dean_letter_notes": stu.dean_letter_notes,
                "dean_allow_dorm": stu.dean_allow_dorm,
                "dean_allow_food": stu.dean_allow_food,
                "dean_allow_internship": stu.dean_allow_internship,
                "dean_valid_from": str(stu.dean_valid_from) if stu.dean_valid_from else None,
                "dean_valid_until": str(stu.dean_valid_until) if stu.dean_valid_until else None,
                "dean_letter_qr": stu.dean_letter_qr or stu.dean_verification_letter_qr or (stu.dean_unique_qr if stu.dean_unique_qr else ""),
                "dean_verification_letter_qr": stu.dean_verification_letter_qr or stu.dean_unique_qr,
                "dean_dorm_food_letter_qr": stu.dean_dorm_food_letter_qr or stu.dean_unique_qr,
                "dean_unique_qr": stu.dean_unique_qr or stu.dean_letter_qr or (get_or_create_dean_qr_code(stu.dean_user or dean, dean_dept) if stu.is_verified_by_dean else ""),
                "internship_letter_sent": stu.internship_letter_sent,
                "internship_letter_sent_at": stu.internship_letter_sent_at.isoformat() if stu.internship_letter_sent_at else None,
                "dorm_food_letter_title": stu.dorm_food_letter_title,
                "dorm_food_letter_notes": stu.dorm_food_letter_notes,
                "dorm_food_letter_sent": stu.dorm_food_letter_sent,
                "dorm_food_letter_sent_at": stu.dorm_food_letter_sent_at.isoformat() if stu.dorm_food_letter_sent_at else None,
                "score_letter_notes": stu.score_letter_notes,
                "score_letter_sent": stu.score_letter_sent,
                "score_letter_sent_at": stu.score_letter_sent_at.isoformat() if stu.score_letter_sent_at else None,
                "score_roster_data": stu.score_roster_data or {},
                "has_score_roster": bool(stu.dean_score_roster_file),
                "roster_download_url": stu.dean_score_roster_file.url if stu.dean_score_roster_file else None,
                "forwarded_to_uil": stu.forwarded_to_uil,
                "emergency_contact": ec_data,
                "logistics": logistics_data,
            })

        dean_title = format_dean_title(dean)
        dean_qr = get_or_create_dean_qr_code(dean, dean_dept)
        return Response({
            "dean_department": dean_dept or "All Departments",
            "dean_title": dean_title,
            "dean_qr_code": dean_qr,
            "total_students": len(students_data),
            "students": students_data,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanVerifyStudentView(APIView):
    """
    1-Click Verify & Clearance Letter Generation:
    Generates HMAC-SHA256 signature, scannable Base64 QR letters, structured Excel score roster
    template (.xlsx), dispatches rich HTML logistics email with embedded Base64 QR code and Dean signature,
    and activates Dean-Student direct chat channel.
    POST /api/v1/uil-profiles/dean/verify-student/<str:pk>/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, pk):
        student = get_object_or_404(UILStudentProfile, id=pk)
        dean = request.user
        dean_title = format_dean_title(dean)

        # 1. Institutional and Department scoping check
        dean_univ = get_user_university(dean)
        dean_dept = get_user_department(dean)
        student_univ = get_student_profile_university(student)
        student_dept = get_student_profile_department(student)

        if not universities_match(student_univ, dean_univ):
            return Response(
                {"detail": f"Institutional Mismatch: Student belongs to '{student_univ or 'Unknown'}', but you are Department Dean of '{dean_univ}'."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_match = (
            departments_match(student_dept, dean_dept)
            or (student.user and departments_match(getattr(student.user, "department", ""), dean_dept))
        )
        if not is_match:
            return Response(
                {"detail": f"Department Mismatch: You can only verify students in your department ({dean_dept}). Student is enrolled in '{student_dept}'."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 2. Strict 3rd year completed eligibility check (academic_year >= 4)
        if student.academic_year < 4:
            return Response(
                {
                    "detail": "Eligibility Violation: Student has not completed 3rd year. Academic Year must be 4 or higher for Track 1 verification.",
                    "academic_year": student.academic_year,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Personal & Academic Dossier Completeness Validation
        missing_fields = []
        if not student.student_id_number:
            missing_fields.append("Student University ID")
        if not student.department:
            missing_fields.append("Department / Field of Study")
        if student.gpa is None:
            missing_fields.append("Cumulative GPA")

        legacy_prof = getattr(student.user, "legacy_student_profile", None) if student.user else None
        if legacy_prof:
            # If the student profile exists, require phone, country, city, date of birth
            if not legacy_prof.phone:
                missing_fields.append("Phone Number")
            if not legacy_prof.country:
                missing_fields.append("Country")
            if not legacy_prof.city:
                missing_fields.append("City")
            if not legacy_prof.date_of_birth:
                missing_fields.append("Date of Birth")

        if missing_fields:
            return Response(
                {
                    "detail": f"Dossier Incomplete: Student must complete all personal and education profile forms before dean verification ({', '.join(missing_fields)}).",
                    "missing_fields": missing_fields,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Read custom letter fields and services options
        allow_dorm = request.data.get("allow_dormitory", True)
        if isinstance(allow_dorm, str):
            allow_dorm = allow_dorm.lower() in ["true", "1", "yes"]
        allow_food = request.data.get("allow_cafeteria", True)
        if isinstance(allow_food, str):
            allow_food = allow_food.lower() in ["true", "1", "yes"]
        allow_internship = request.data.get("allow_internship", True)
        if isinstance(allow_internship, str):
            allow_internship = allow_internship.lower() in ["true", "1", "yes"]

        now = timezone.now()
        timestamp_str = now.isoformat()
        user_name = student.user.full_name if student.user else student.student_id_number

        raw_valid_from = request.data.get("valid_from")
        raw_valid_until = request.data.get("valid_until")
        letter_title = request.data.get("letter_title", "Official Institutional Clearance & Services Pass").strip()
        notes = request.data.get("notes", "").strip()
        if not notes:
            notes = (
                f"Student officially verified and cleared by {dean_title} for Track 1 In-House Internship Program. "
                f"Authorized for campus dormitory residence and student union cafeteria dining pass."
            )

        try:
            valid_from = datetime.date.fromisoformat(raw_valid_from) if raw_valid_from else now.date()
        except Exception:
            valid_from = now.date()

        try:
            valid_until = datetime.date.fromisoformat(raw_valid_until) if raw_valid_until else (now.date() + timezone.timedelta(days=120))
        except Exception:
            valid_until = now.date() + timezone.timedelta(days=120)

        # 4. Generate Cryptographic HMAC-SHA256 digital signature
        msg_payload = f"DEAN_VERIFY:{student.student_id_number}:{dean.id}:{timestamp_str}"
        hmac_sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), msg_payload.encode("utf-8"), hashlib.sha256).hexdigest()

        # 5. Canonical Dean QR Code (One persistent QR code for this Dean across all documents)
        dean_unique_qr = get_or_create_dean_qr_code(dean, dean_dept)
        verification_qr = dean_unique_qr
        dorm_food_qr = dean_unique_qr
        dean_letter_qr = dean_unique_qr

        # 6. Generate Structured Excel Score Roster Template
        roster_file = generate_dean_score_roster_template(
            department_name=student.department,
            academic_year=student.academic_year,
            students_list=[{
                "student_id": student.student_id_number,
                "full_name": user_name,
                "department": student.department,
                "academic_year": student.academic_year,
                "advisor_score": "25",
                "uil_score": "25",
                "doc_score": "25",
                "pres_score": "25",
            }]
        )

        # Save to student profile
        student.is_verified_by_dean = True
        student.dean_user = dean
        student.dean_verified_at = now
        student.dean_signature_hash = hmac_sig
        student.dean_unique_qr = dean_unique_qr
        student.dean_verification_letter_qr = dean_unique_qr
        student.dean_dorm_food_letter_qr = dean_unique_qr
        student.dean_letter_qr = dean_unique_qr
        student.dean_letter_title = letter_title or "Official Internship Program Clearance Letter"
        student.dean_letter_notes = notes
        student.dorm_food_letter_title = "Official Campus Dormitory & Cafeteria Clearance Authorization"
        student.dorm_food_letter_notes = f"Student authorized by {dean_title} for campus residence dormitory and student union cafeteria dining access."
        student.score_letter_notes = f"Official academic standing verified and approved by {dean_title}."
        student.score_roster_data = {
            "advisor_score": 25,
            "uil_score": 25,
            "doc_score": 25,
            "pres_score": 25,
            "total_score": 100,
            "remarks": "Approved 3rd-year completed student.",
        }
        student.dean_allow_dorm = allow_dorm
        student.dean_allow_food = allow_food
        student.dean_allow_internship = allow_internship
        student.dean_valid_from = valid_from
        student.dean_valid_until = valid_until
        student.dean_score_roster_file.save(roster_file.name, roster_file, save=False)
        student.save()

        # 9. Auto-link/update CampusLogistics record with valid_from and valid_until
        cohort = InHouseCohort.objects.filter(is_open=True).first()
        if not cohort:
            cohort = InHouseCohort.objects.create(
                university_name=student.campus_city or "Addis Ababa University",
                academic_year=str(student.academic_year),
                start_date=now.date(),
                end_date=now.date() + timezone.timedelta(days=120),
                capacity_k=100,
                enrolled_count=1,
            )

        logistics, _ = CampusLogistics.objects.get_or_create(
            student=student,
            defaults={"cohort": cohort},
        )
        logistics.dean_approved = True
        logistics.dean_signature_hash = hmac_sig
        logistics.dean_signed_by = dean
        logistics.dean_signed_at = now
        logistics.valid_from = valid_from
        logistics.valid_until = valid_until
        logistics.save()

        valid_from_str = str(valid_from)
        valid_until_str = str(valid_until)

        # 10. Dispatch Official Logistics Email with Embedded Base64 QR code & Dean Digital Signature
        if student.user and student.user.email:
            plain_email = (
                f"Official Verification Approved: SmartIntern-ET Track 1\n\n"
                f"Dear {user_name},\n\n"
                f"Your Department Dean ({dean_title}) has officially verified your Track 1 eligibility.\n"
                f"Student University ID: {student.student_id_number}\n"
                f"Department: {student.department}\n"
                f"Academic Year: Year {student.academic_year} (Completed 3rd Year)\n"
                f"HMAC Signature Hash: {hmac_sig}\n"
                f"Clearance Window: {valid_from_str} to {valid_until_str}\n"
                f"Allowed Services: Dormitory ({'Yes' if allow_dorm else 'No'}), "
                f"Cafeteria ({'Yes' if allow_food else 'No'}), Internship ({'Yes' if allow_internship else 'No'})\n"
                f"Dean Remarks: {notes}\n\n"
                f"Your scannable Base64 QR Letter is available in this email and on your Student Dashboard.\n"
                f"Direct communication with your Department Dean is now active.\n"
            )
            html_email = f"""
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
              <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #d97706, #b45309); padding: 28px 24px; text-align: center; color: #ffffff;">
                  <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; display: inline-block; margin-bottom: 8px;">
                    SmartIntern-ET National Gateway
                  </span>
                  <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Track 1 Institutional Clearance Approved</h1>
                  <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.95;">Official Clearance & Logistics Pass Issued by {dean_title}</p>
                </div>

                <div style="padding: 24px 28px; color: #1e293b;">
                  <p style="font-size: 15px; margin-top: 0;">Dear <strong>{user_name}</strong>,</p>
                  <p style="font-size: 13px; line-height: 1.6; color: #475569;">
                    Your Department Dean (<strong>{dean_title}</strong>) has officially reviewed and verified your 3rd-year completed academic credentials for the SmartIntern-ET Track 1 Program.
                  </p>

                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; width: 40%;">Student University ID:</td>
                        <td style="padding: 6px 0; font-weight: 700; font-family: monospace; color: #0f172a;">{student.student_id_number}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Academic Department:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{student.department}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Academic Status:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #059669;">Year {student.academic_year} (Eligible - 3rd Year Completed)</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Clearance Validity:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{valid_from_str} to {valid_until_str}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Allowed Services:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #0284c7;">
                          {'✓ Housing ' if allow_dorm else ''}{'✓ Dining ' if allow_food else ''}{'✓ Internship' if allow_internship else ''}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Dean Remarks:</td>
                        <td style="padding: 6px 0; font-weight: 500; color: #334155; font-style: italic;">{notes}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b;">Dean Signature:</td>
                        <td style="padding: 6px 0; font-family: monospace; font-size: 10px; word-break: break-all; color: #334155;">{hmac_sig}</td>
                      </tr>
                    </table>
                  </div>

                  <div style="text-align: center; margin: 24px 0; padding: 16px; background: #fafafa; border: 1px dashed #cbd5e1; border-radius: 12px;">
                    <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">
                      Scannable Base64 Digital Dean Clearance Letter QR
                    </p>
                    <img src="{dean_letter_qr}" alt="Dean Verification QR" style="width: 210px; height: 210px; border: 3px solid #d97706; border-radius: 10px; display: inline-block;" />
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8;">Present this scannable QR pass to University Housing & Student Union Cafeteria.</p>
                  </div>

                  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #1e40af;">
                      💬 <strong>Direct Dean Communication Channel Active:</strong> A secure communication channel between you and {dean_title} has been unlocked on your Student Dashboard.
                    </p>
                  </div>
                </div>

                <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
                  SmartIntern-ET Higher Education Academic Gateway • Verified by {dean_title}
                </div>
              </div>
            </body>
            </html>
            """
            try:
                from django.core.mail import send_mail
                send_mail(
                    subject=f"Official Academic Clearance Issued: {student.student_id_number} - SmartIntern-ET",
                    message=plain_email,
                    html_message=html_email,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[student.user.email],
                    fail_silently=True,
                )
            except Exception as exc:
                logger.warning("Failed to dispatch Dean verification email to %s: %s", student.user.email, exc)

        # 11. Auto-create initial Dean welcome message in TeamChannelMessage
        if student.user:
            welcome_msg = (
                f"Greetings {user_name}. I ({dean_title}) have officially verified your Track 1 eligibility "
                f"and approved your campus logistics clearance pass. You may use this secure official channel to consult "
                f"with me regarding academic clearance, project defenses, and your internship."
            )
            TeamChannelMessage.objects.get_or_create(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
                sender=dean,
                recipient=student.user,
                defaults={"message": welcome_msg},
            )
            # 12. Create in-app notification for the verified student
            create_notification(
                recipient=student.user,
                actor=dean,
                title="Track 1 Verification Approved",
                message=f"Verified successfully by {dean_title}. Clearance pass and campus services authorized.",
                notification_type=Notification.NotificationType.VERIFICATION,
                link="/student/dashboard?letter=true&verified=true",
            )

        return Response({
            "message": f"Student verified successfully by {dean_title}!",
            "dean_title": dean_title,
            "student_id": student.student_id_number,
            "signature_hash": hmac_sig,
            "dean_verification_letter_qr": verification_qr,
            "dean_dorm_food_letter_qr": dorm_food_qr,
            "dean_letter_qr": dean_letter_qr,
            "dean_unique_qr": dean_unique_qr,
            "internship_letter_sent": student.internship_letter_sent,
            "dorm_food_letter_sent": student.dorm_food_letter_sent,
            "score_letter_sent": student.score_letter_sent,
            "dean_letter_notes": notes,
            "dean_allow_dorm": allow_dorm,
            "dean_allow_food": allow_food,
            "dean_allow_internship": allow_internship,
            "valid_from": valid_from_str,
            "valid_until": valid_until_str,
            "roster_download_url": student.dean_score_roster_file.url if student.dean_score_roster_file else None,
            "has_score_roster": bool(student.dean_score_roster_file),
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanIssueLetterView(APIView):
    """
    Manually customize, create, or re-issue the official clearance letter with Dean QR code.
    POST /api/v1/uil-profiles/dean/issue-letter/<str:student_id>/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, student_id):
        student = get_object_or_404(UILStudentProfile, id=student_id)
        dean = request.user
        dean_title = format_dean_title(dean)

        # Institutional and Department scoping
        dean_univ = get_user_university(dean)
        dean_dept = get_user_department(dean)
        student_univ = get_student_profile_university(student)
        student_dept = get_student_profile_department(student)

        if not universities_match(student_univ, dean_univ):
            return Response(
                {"detail": f"Institutional Mismatch: You are not authorized to issue clearance letters for students outside your university ({dean_univ})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_match = (
            departments_match(student_dept, dean_dept)
            or (student.user and departments_match(getattr(student.user, "department", ""), dean_dept))
        )
        if not is_match:
            return Response(
                {"detail": f"Department Mismatch: You are not authorized to issue clearance letters for students outside your department ({dean_dept})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        letter_type = request.data.get("letter_type", "").strip().lower()
        if not letter_type:
            # Fallback deduction based on payload keys
            if "dorm_food" in request.data or "allow_dormitory" in request.data and "advisor_score" not in request.data and "notes" not in request.data:
                letter_type = "dorm_food"
            elif "advisor_score" in request.data or "uil_score" in request.data:
                letter_type = "score"
            else:
                letter_type = "internship"

        now = timezone.now()
        timestamp_str = now.isoformat()
        dean_unique_qr = get_or_create_dean_qr_code(dean, dean_dept)

        raw_valid_from = request.data.get("valid_from")
        raw_valid_until = request.data.get("valid_until")
        try:
            valid_from = datetime.date.fromisoformat(raw_valid_from) if raw_valid_from else (student.dean_valid_from or now.date())
        except Exception:
            valid_from = now.date()

        try:
            valid_until = datetime.date.fromisoformat(raw_valid_until) if raw_valid_until else (student.dean_valid_until or (now.date() + timezone.timedelta(days=120)))
        except Exception:
            valid_until = now.date() + timezone.timedelta(days=120)

        student.dean_user = dean
        student.dean_valid_from = valid_from
        student.dean_valid_until = valid_until
        student.dean_unique_qr = dean_unique_qr
        student.dean_letter_qr = dean_unique_qr
        student.dean_dorm_food_letter_qr = dean_unique_qr
        student.dean_verification_letter_qr = dean_unique_qr

        # 1. Internship Clearance Letter
        if letter_type in ["internship", "clearance", "all"]:
            internship_notes = request.data.get("notes", "").strip() or student.dean_letter_notes or (
                f"Official internship clearance granted by {dean_title} for Track 1 In-House Internship Program."
            )
            allow_internship = request.data.get("allow_internship", student.dean_allow_internship)
            if isinstance(allow_internship, str):
                allow_internship = allow_internship.lower() in ["true", "1", "yes"]

            student.dean_letter_title = request.data.get("letter_title", "Official Internship Program Clearance Letter").strip()
            student.dean_letter_notes = internship_notes
            student.dean_allow_internship = allow_internship
            student.internship_letter_sent = True
            student.internship_letter_sent_at = now

            if student.user:
                create_notification(
                    recipient=student.user,
                    actor=dean,
                    title="Internship Clearance Letter Issued",
                    message=f"Official Internship Clearance Letter issued by {dean_title}.",
                    notification_type=Notification.NotificationType.CLEARANCE_LETTER,
                    link="/student/dashboard?tab=track1&letter=internship",
                )

        # 2. Dorm & Cafeteria Clearance Letter
        if letter_type in ["dorm_food", "housing_dining", "dorm_cafeteria", "all"]:
            allow_dorm = request.data.get("allow_dormitory", student.dean_allow_dorm)
            if isinstance(allow_dorm, str):
                allow_dorm = allow_dorm.lower() in ["true", "1", "yes"]
            allow_food = request.data.get("allow_cafeteria", student.dean_allow_food)
            if isinstance(allow_food, str):
                allow_food = allow_food.lower() in ["true", "1", "yes"]

            dorm_notes = request.data.get("dorm_food_notes") or request.data.get("notes", "").strip() or student.dorm_food_letter_notes or (
                f"Official dormitory residence and campus cafeteria dining access authorized by {dean_title}."
            )
            student.dorm_food_letter_title = request.data.get("dorm_food_title") or request.data.get("letter_title", "Official Campus Dormitory & Cafeteria Clearance Authorization").strip()
            student.dorm_food_letter_notes = dorm_notes
            student.dean_allow_dorm = allow_dorm
            student.dean_allow_food = allow_food
            student.dorm_food_letter_sent = True
            student.dorm_food_letter_sent_at = now

            logistics = CampusLogistics.objects.filter(student=student).first()
            if logistics:
                logistics.dean_approved = True
                logistics.dean_signed_by = dean
                logistics.dean_signed_at = now
                logistics.valid_from = valid_from
                logistics.valid_until = valid_until
                logistics.save()

            if student.user:
                create_notification(
                    recipient=student.user,
                    actor=dean,
                    title="Dorm & Cafeteria Clearance Issued",
                    message=f"Official Campus Dormitory & Cafeteria Clearance Letter issued by {dean_title}.",
                    notification_type=Notification.NotificationType.CLEARANCE_LETTER,
                    link="/student/dashboard?tab=track1&letter=dorm_food",
                )

        # 3. Score Letter / Excel Roster
        if letter_type in ["score", "score_roster", "roster", "all"]:
            score_notes = request.data.get("score_notes") or request.data.get("notes", "").strip() or student.score_letter_notes or (
                f"Official academic evaluation score roster approved by {dean_title}."
            )
            existing_roster = student.score_roster_data or {}
            advisor_score = request.data.get("advisor_score", existing_roster.get("advisor_score", 25))
            uil_score = request.data.get("uil_score", existing_roster.get("uil_score", 25))
            doc_score = request.data.get("doc_score", existing_roster.get("doc_score", 25))
            pres_score = request.data.get("pres_score", existing_roster.get("pres_score", 25))
            try:
                total_score = float(advisor_score) + float(uil_score) + float(doc_score) + float(pres_score)
            except Exception:
                total_score = 100

            if "gpa" in request.data and request.data["gpa"]:
                try:
                    student.gpa = float(request.data["gpa"])
                except Exception:
                    pass

            student.score_letter_notes = score_notes
            student.score_letter_sent = True
            student.score_letter_sent_at = now
            student.score_roster_data = {
                "advisor_score": advisor_score,
                "uil_score": uil_score,
                "doc_score": doc_score,
                "pres_score": pres_score,
                "total_score": total_score,
                "notes": score_notes,
            }

            user_name = student.user.full_name if student.user else student.student_id_number
            roster_file = generate_dean_score_roster_template(
                department_name=student.department,
                academic_year=student.academic_year,
                students_list=[{
                    "student_id": student.student_id_number,
                    "full_name": user_name,
                    "department": student.department,
                    "academic_year": student.academic_year,
                    "advisor_score": str(advisor_score),
                    "uil_score": str(uil_score),
                    "doc_score": str(doc_score),
                    "pres_score": str(pres_score),
                }]
            )
            student.dean_score_roster_file.save(roster_file.name, roster_file, save=False)

            if student.user:
                create_notification(
                    recipient=student.user,
                    actor=dean,
                    title="Official Score Letter Released",
                    message=f"Official Academic Score Letter and Evaluation Roster issued by {dean_title}.",
                    notification_type=Notification.NotificationType.CLEARANCE_LETTER,
                    link="/student/dashboard?tab=track1&letter=score",
                )

        # Legacy backward-compatibility overrides for allow_dormitory / allow_cafeteria
        if "allow_dormitory" in request.data:
            val = request.data.get("allow_dormitory")
            student.dean_allow_dorm = val.lower() in ["true", "1", "yes"] if isinstance(val, str) else bool(val)
        if "allow_cafeteria" in request.data:
            val = request.data.get("allow_cafeteria")
            student.dean_allow_food = val.lower() in ["true", "1", "yes"] if isinstance(val, str) else bool(val)

        student.save()

        return Response({
            "message": f"Official letter ({letter_type}) successfully issued by {dean_title}!",
            "dean_title": dean_title,
            "student_id": student.student_id_number,
            "letter_type": letter_type,
            "dean_unique_qr": dean_unique_qr,
            "dean_letter_qr": dean_unique_qr,
            "dean_dorm_food_letter_qr": dean_unique_qr,
            "dean_verification_letter_qr": dean_unique_qr,
            "dean_letter_title": student.dean_letter_title,
            "dean_letter_notes": student.dean_letter_notes,
            "internship_letter_sent": student.internship_letter_sent,
            "internship_letter_sent_at": student.internship_letter_sent_at.isoformat() if student.internship_letter_sent_at else None,
            "dorm_food_letter_title": student.dorm_food_letter_title,
            "dorm_food_letter_notes": student.dorm_food_letter_notes,
            "dorm_food_letter_sent": student.dorm_food_letter_sent,
            "dorm_food_letter_sent_at": student.dorm_food_letter_sent_at.isoformat() if student.dorm_food_letter_sent_at else None,
            "score_letter_notes": student.score_letter_notes,
            "score_letter_sent": student.score_letter_sent,
            "score_letter_sent_at": student.score_letter_sent_at.isoformat() if student.score_letter_sent_at else None,
            "score_roster_data": student.score_roster_data,
            "dean_allow_dorm": student.dean_allow_dorm,
            "dean_allow_food": student.dean_allow_food,
            "dean_allow_internship": student.dean_allow_internship,
            "valid_from": str(student.dean_valid_from) if student.dean_valid_from else None,
            "valid_until": str(student.dean_valid_until) if student.dean_valid_until else None,
            "roster_download_url": student.dean_score_roster_file.url if student.dean_score_roster_file else None,
            "has_score_roster": bool(student.dean_score_roster_file),
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Students"])
class StudentUILProfileMeView(APIView):
    """
    GET /api/v1/uil-profiles/student/me/
    Retrieves the authenticated student's official UIL profile, Dean verification status,
    Dean Dr. credentials, custom clearance letter details, and view-only score roster preview.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request):
        uil_profile = _get_or_create_uil_profile_for_user(request.user)

        dean_user = uil_profile.dean_user
        if not dean_user:
            from apps.logistics.models import CampusLogistics
            logistics = CampusLogistics.objects.filter(student=uil_profile, dean_approved=True).first()
            if logistics and logistics.dean_signed_by:
                dean_user = logistics.dean_signed_by
                uil_profile.dean_user = dean_user
                uil_profile.save(update_fields=["dean_user"])

        if not dean_user:
            stu_univ = get_student_profile_university(uil_profile)
            stu_dept = get_student_profile_department(uil_profile)
            for d in User.objects.filter(role=User.Role.DEPT_DEAN, is_active=True):
                d_univ = get_user_university(d)
                d_dept = get_user_department(d)
                if universities_match(stu_univ, d_univ) and departments_match(stu_dept, d_dept):
                    dean_user = d
                    break

        dean_title = format_dean_title(dean_user) if dean_user else "Department Dean"

        # Generate score roster preview object for view-only student inspection
        dean_dept = (dean_user.department if dean_user else None) or uil_profile.department
        dean_unique_qr = uil_profile.dean_unique_qr
        if not dean_unique_qr and dean_user:
            dean_unique_qr = get_or_create_dean_qr_code(dean_user, dean_dept)
            if uil_profile.is_verified_by_dean:
                uil_profile.dean_unique_qr = dean_unique_qr
                uil_profile.dean_letter_qr = dean_unique_qr
                uil_profile.dean_dorm_food_letter_qr = dean_unique_qr
                uil_profile.dean_verification_letter_qr = dean_unique_qr
                uil_profile.save(update_fields=[
                    "dean_unique_qr", "dean_letter_qr", "dean_dorm_food_letter_qr", "dean_verification_letter_qr"
                ])

        allowed_list = []
        if uil_profile.dean_allow_dorm:
            allowed_list.append("Dormitory Housing Clearance")
        if uil_profile.dean_allow_food:
            allowed_list.append("Student Union Cafeteria Meal Access")
        if uil_profile.dean_allow_internship:
            allowed_list.append("Track 1 In-House Internship Placement")

        score_roster_preview = {
            "student_id": uil_profile.student_id_number,
            "full_name": request.user.full_name,
            "department": uil_profile.department,
            "academic_year": f"Year {uil_profile.academic_year}",
            "gpa": str(uil_profile.gpa) if uil_profile.gpa else "N/A",
            "eligibility_status": "APPROVED - 3RD YEAR COMPLETED" if uil_profile.is_verified_by_dean else "PENDING REVIEW",
            "endorsed_by": dean_title if uil_profile.is_verified_by_dean else "Pending Dean Review",
            "signature_hash": uil_profile.dean_signature_hash or "HMAC-SHA256-PENDING",
            "verified_date": uil_profile.dean_verified_at.strftime("%Y-%m-%d") if uil_profile.dean_verified_at else "N/A",
            "allowed_services": allowed_list,
            "valid_from": str(uil_profile.dean_valid_from) if uil_profile.dean_valid_from else None,
            "valid_until": str(uil_profile.dean_valid_until) if uil_profile.dean_valid_until else None,
            "score_roster_data": uil_profile.score_roster_data or {},
            "score_letter_notes": uil_profile.score_letter_notes,
            "score_letter_sent": uil_profile.score_letter_sent,
            "dean_unique_qr": dean_unique_qr,
        }

        return Response({
            "id": str(uil_profile.id),
            "student_id_number": uil_profile.student_id_number,
            "campus_city": uil_profile.campus_city,
            "department": uil_profile.department,
            "academic_year": uil_profile.academic_year,
            "gpa": str(uil_profile.gpa) if uil_profile.gpa else None,
            "is_eligible": uil_profile.academic_year >= 4,
            "is_verified_by_dean": uil_profile.is_verified_by_dean,
            "dean_verified_at": uil_profile.dean_verified_at.isoformat() if uil_profile.dean_verified_at else None,
            "dean_name": dean_user.full_name if dean_user else None,
            "dean_title": dean_title,
            "dean_email": dean_user.email if dean_user else None,
            "dean_department": dean_dept,
            "dean_letter_title": uil_profile.dean_letter_title,
            "dean_letter_notes": uil_profile.dean_letter_notes,
            "internship_letter_sent": uil_profile.internship_letter_sent,
            "internship_letter_sent_at": uil_profile.internship_letter_sent_at.isoformat() if uil_profile.internship_letter_sent_at else None,
            "dorm_food_letter_title": uil_profile.dorm_food_letter_title,
            "dorm_food_letter_notes": uil_profile.dorm_food_letter_notes,
            "dorm_food_letter_sent": uil_profile.dorm_food_letter_sent,
            "dorm_food_letter_sent_at": uil_profile.dorm_food_letter_sent_at.isoformat() if uil_profile.dorm_food_letter_sent_at else None,
            "score_letter_notes": uil_profile.score_letter_notes,
            "score_letter_sent": uil_profile.score_letter_sent,
            "score_letter_sent_at": uil_profile.score_letter_sent_at.isoformat() if uil_profile.score_letter_sent_at else None,
            "score_roster_data": uil_profile.score_roster_data or {},
            "dean_allow_dorm": uil_profile.dean_allow_dorm,
            "dean_allow_food": uil_profile.dean_allow_food,
            "dean_allow_internship": uil_profile.dean_allow_internship,
            "dean_valid_from": str(uil_profile.dean_valid_from) if uil_profile.dean_valid_from else None,
            "dean_valid_until": str(uil_profile.dean_valid_until) if uil_profile.dean_valid_until else None,
            "dean_signature_hash": uil_profile.dean_signature_hash,
            "dean_unique_qr": dean_unique_qr,
            "dean_verification_letter_qr": dean_unique_qr,
            "dean_dorm_food_letter_qr": dean_unique_qr,
            "dean_letter_qr": dean_unique_qr,
            "has_score_roster": bool(uil_profile.dean_score_roster_file),
            "roster_download_url": uil_profile.dean_score_roster_file.url if uil_profile.dean_score_roster_file else None,
            "score_roster_preview": score_roster_preview,
            "forwarded_to_uil": uil_profile.forwarded_to_uil,
            "forwarded_to_uil_at": uil_profile.forwarded_to_uil_at.isoformat() if uil_profile.forwarded_to_uil_at else None,
            "forwarded_to_dorm": uil_profile.forwarded_to_dorm,
            "forwarded_to_dorm_at": uil_profile.forwarded_to_dorm_at.isoformat() if uil_profile.forwarded_to_dorm_at else None,
            "forwarded_to_student_dean": uil_profile.forwarded_to_student_dean,
            "forwarded_to_student_dean_at": uil_profile.forwarded_to_student_dean_at.isoformat() if uil_profile.forwarded_to_student_dean_at else None,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Students"])
class StudentForwardToUILView(APIView):
    """
    Student forwards their verified Dean letters & QR codes to the UIL Officer.
    POST /api/v1/uil-profiles/student/forward-to-uil/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student = get_object_or_404(UILStudentProfile, student__user=request.user)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "You must be verified by your Department Dean before forwarding documents to UIL."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_univ = get_student_profile_university(student)
        student.forwarded_to_uil = True
        student.forwarded_to_uil_at = timezone.now()
        student.save(update_fields=["forwarded_to_uil", "forwarded_to_uil_at"])

        # Notify UIL Officer(s) belonging to the same university
        notified_officers = 0
        uil_officers = User.objects.filter(role=User.Role.UIL_OFFICER, is_active=True)
        for officer in uil_officers:
            officer_univ = get_user_university(officer)
            if universities_match(student_univ, officer_univ):
                student_name = request.user.full_name or student.student_id_number
                create_notification(
                    recipient=officer,
                    actor=request.user,
                    title="Track 1 Clearance Package Forwarded",
                    message=f"{student_name} ({student.student_id_number}) from {student.department} at {student_univ} has forwarded their verified clearance documents.",
                    notification_type=Notification.NotificationType.COHORT,
                    link="/uil/dashboard?tab=cohorts",
                )
                notified_officers += 1

        return Response({
            "message": "Dean verification letter and logistics clearance QR codes successfully forwarded to UIL Officer.",
            "forwarded_at": student.forwarded_to_uil_at.isoformat(),
            "notified_officers": notified_officers,
            "university": student_univ,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Students"])
class StudentForwardToDormView(APIView):
    """
    Student forwards their verified Dormitory clearance letter to Dormitory Administration.
    Enforces that Dormitory Admin is admin-verified, has a completed profile with university and unique staff ID,
    and belongs to the exact same university.
    POST /api/v1/uil-profiles/student/forward-to-dorm/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student = get_object_or_404(UILStudentProfile, student__user=request.user)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "You must be verified by your Department Dean before forwarding documents to Dormitory Administration."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_univ = get_student_profile_university(student)
        if not student_univ:
            return Response(
                {"detail": "Your university affiliation is missing from your student profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dorm_admins = User.objects.filter(role=User.Role.DORM_ADMIN, is_active=True)
        matching_admins = [u for u in dorm_admins if universities_match(student_univ, get_user_university(u))]
        if not matching_admins:
            return Response(
                {"detail": f"No Dormitory Administrator registered for {student_univ}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approved_admins = [u for u in matching_admins if getattr(u, "is_approved", False)]
        if not approved_admins:
            return Response(
                {"detail": f"The Dormitory Administrator for {student_univ} has not been verified/approved by the platform administrator yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_profile_admins = [
            u for u in approved_admins
            if (u.university_name and u.university_name.strip()) and (getattr(u, "staff_id_number", "") and u.staff_id_number.strip())
        ]
        if not valid_profile_admins:
            return Response(
                {"detail": f"The Dormitory Administrator for {student_univ} has not completed their institutional profile with a verified university name and unique Staff ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student.forwarded_to_dorm = True
        student.forwarded_to_dorm_at = timezone.now()
        student.save(update_fields=["forwarded_to_dorm", "forwarded_to_dorm_at"])

        student_name = request.user.full_name or student.student_id_number
        for admin_user in valid_profile_admins:
            create_notification(
                recipient=admin_user,
                actor=request.user,
                title="Campus Dormitory Clearance Letter Forwarded",
                message=f"{student_name} ({student.student_id_number}) from {student.department} at {student_univ} has forwarded their official Campus Dormitory Clearance Permit.",
                notification_type=Notification.NotificationType.COHORT,
                link="/dorm/dashboard",
            )

        return Response({
            "message": "Official Dormitory Clearance Letter successfully forwarded to Dormitory Administration.",
            "forwarded_at": student.forwarded_to_dorm_at.isoformat(),
            "notified_officers": len(valid_profile_admins),
            "university": student_univ,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Students"])
class StudentForwardToStudentDeanView(APIView):
    """
    Student forwards their verified Cafeteria clearance letter to the Student Dean.
    Enforces that Student Dean is admin-verified, has a completed profile with university and unique staff ID,
    and belongs to the exact same university.
    POST /api/v1/uil-profiles/student/forward-to-student-dean/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student = get_object_or_404(UILStudentProfile, student__user=request.user)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "You must be verified by your Department Dean before forwarding documents to the Student Dean."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_univ = get_student_profile_university(student)
        if not student_univ:
            return Response(
                {"detail": "Your university affiliation is missing from your student profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        union_deans = User.objects.filter(role=User.Role.STUDENT_UNION, is_active=True)
        matching_deans = [u for u in union_deans if universities_match(student_univ, get_user_university(u))]
        if not matching_deans:
            return Response(
                {"detail": f"No Student Dean registered for {student_univ}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approved_deans = [u for u in matching_deans if getattr(u, "is_approved", False)]
        if not approved_deans:
            return Response(
                {"detail": f"The Student Dean for {student_univ} has not been verified/approved by the platform administrator yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_profile_deans = [
            u for u in approved_deans
            if (u.university_name and u.university_name.strip()) and (getattr(u, "staff_id_number", "") and u.staff_id_number.strip())
        ]
        if not valid_profile_deans:
            return Response(
                {"detail": f"The Student Dean for {student_univ} has not completed their institutional profile with a verified university name and unique Staff ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student.forwarded_to_student_dean = True
        student.forwarded_to_student_dean_at = timezone.now()
        student.save(update_fields=["forwarded_to_student_dean", "forwarded_to_student_dean_at"])

        student_name = request.user.full_name or student.student_id_number
        for dean_user in valid_profile_deans:
            create_notification(
                recipient=dean_user,
                actor=request.user,
                title="Campus Cafeteria Clearance Letter Forwarded",
                message=f"{student_name} ({student.student_id_number}) from {student.department} at {student_univ} has forwarded their official Campus Cafeteria Clearance Permit.",
                notification_type=Notification.NotificationType.COHORT,
                link="/union/dashboard",
            )

        return Response({
            "message": "Official Cafeteria Clearance Letter successfully forwarded to Student Dean.",
            "forwarded_at": student.forwarded_to_student_dean_at.isoformat(),
            "notified_officers": len(valid_profile_deans),
            "university": student_univ,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Dormitory Administration"])
class DormForwardedLettersListView(APIView):
    """
    Dormitory Administrator views forwarded student dorm clearance letters for their university.
    GET /api/v1/uil-profiles/dorm/forwarded-letters/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role_upper = str(getattr(request.user, "role", "")).upper()
        if role_upper not in (str(User.Role.DORM_ADMIN).upper(), str(User.Role.ADMIN).upper()) and not request.user.is_staff:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        user_univ = get_user_university(request.user)
        students = UILStudentProfile.objects.filter(
            forwarded_to_dorm=True
        ).select_related("student__user", "dean_user").order_by("-forwarded_to_dorm_at")

        letters = []
        for stu in students:
            stu_univ = get_student_profile_university(stu)
            if user_univ and not universities_match(user_univ, stu_univ):
                continue
            stu_user = getattr(stu.student, "user", None)
            dean_user = stu.dean_user
            letters.append({
                "student_id": str(stu.id),
                "student_id_number": stu.student_id_number,
                "student_name": stu_user.full_name if stu_user else stu.student_id_number,
                "student_email": stu_user.email if stu_user else "",
                "department": stu.department,
                "university_name": stu_univ,
                "academic_year": stu.academic_year,
                "dean_title": format_dean_title(dean_user) if dean_user else "Department Dean",
                "dean_verified_at": stu.dean_verified_at.isoformat() if stu.dean_verified_at else None,
                "dean_signature_hash": stu.dean_signature_hash,
                "letter_title": stu.dorm_food_letter_title or "CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT",
                "letter_notes": stu.dorm_food_letter_notes,
                "allow_dorm": stu.dean_allow_dorm,
                "valid_from": str(stu.dean_valid_from) if stu.dean_valid_from else None,
                "valid_until": str(stu.dean_valid_until) if stu.dean_valid_until else None,
                "qr_code": stu.dean_dorm_food_letter_qr or stu.dean_unique_qr,
                "forwarded_at": stu.forwarded_to_dorm_at.isoformat() if stu.forwarded_to_dorm_at else None,
            })

        return Response(letters, status=status.HTTP_200_OK)


@extend_schema(tags=["Student Dean"])
class StudentDeanForwardedLettersListView(APIView):
    """
    Student Dean / Student Union views forwarded cafeteria clearance letters for their university.
    GET /api/v1/uil-profiles/student-dean/forwarded-letters/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role_upper = str(getattr(request.user, "role", "")).upper()
        if role_upper not in (str(User.Role.STUDENT_UNION).upper(), str(User.Role.ADMIN).upper()) and not request.user.is_staff:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        user_univ = get_user_university(request.user)
        students = UILStudentProfile.objects.filter(
            forwarded_to_student_dean=True
        ).select_related("student__user", "dean_user").order_by("-forwarded_to_student_dean_at")

        letters = []
        for stu in students:
            stu_univ = get_student_profile_university(stu)
            if user_univ and not universities_match(user_univ, stu_univ):
                continue
            stu_user = getattr(stu.student, "user", None)
            dean_user = stu.dean_user
            letters.append({
                "student_id": str(stu.id),
                "student_id_number": stu.student_id_number,
                "student_name": stu_user.full_name if stu_user else stu.student_id_number,
                "student_email": stu_user.email if stu_user else "",
                "department": stu.department,
                "university_name": stu_univ,
                "academic_year": stu.academic_year,
                "dean_title": format_dean_title(dean_user) if dean_user else "Department Dean",
                "dean_verified_at": stu.dean_verified_at.isoformat() if stu.dean_verified_at else None,
                "dean_signature_hash": stu.dean_signature_hash,
                "letter_title": stu.dorm_food_letter_title or "CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT",
                "letter_notes": stu.dorm_food_letter_notes,
                "allow_food": stu.dean_allow_food,
                "valid_from": str(stu.dean_valid_from) if stu.dean_valid_from else None,
                "valid_until": str(stu.dean_valid_until) if stu.dean_valid_until else None,
                "qr_code": stu.dean_dorm_food_letter_qr or stu.dean_unique_qr,
                "forwarded_at": stu.forwarded_to_student_dean_at.isoformat() if stu.forwarded_to_student_dean_at else None,
            })

        return Response(letters, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanUnsealScoreSheetView(APIView):
    """
    Dean scans UIL QR code or unseals squad score sheet for final defense.
    POST /api/v1/uil-profiles/dean/unseal-score-sheet/<uuid:team_id>/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        if not team.uil_score_sealed:
            return Response(
                {"detail": "UIL Officer has not sealed the score sheet yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team.is_unsealed_by_dean = True
        team.save(update_fields=["is_unsealed_by_dean", "updated_at"])

        return Response({
            "message": f"Score sheet for team '{team.team_name}' unsealed successfully.",
            "uil_score": str(team.uil_score),
            "advisor_score": str(team.advisor_score),
            "is_unsealed_by_dean": True,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanScheduleDefenseView(APIView):
    """
    Dean schedules the final project defense and provides a Google Meet link.
    POST /api/v1/uil-profiles/dean/schedule-defense/<uuid:team_id>/
    Body: {"defense_scheduled_at": "...", "venue": "...", "meet_url": "..."}
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        sched = request.data.get("defense_scheduled_at")
        venue = request.data.get("venue", "Main Campus Hall / Remote")
        meet_url = request.data.get("meet_url", "https://meet.google.com/xyz-smart-intern")

        if sched:
            team.defense_scheduled_at = sched
        team.defense_venue = venue
        team.google_meet_url = meet_url
        team.save(update_fields=["defense_scheduled_at", "defense_venue", "google_meet_url", "updated_at"])

        return Response({
            "message": f"Final defense scheduled for team '{team.team_name}'.",
            "defense_scheduled_at": str(team.defense_scheduled_at),
            "venue": team.defense_venue,
            "meet_url": team.google_meet_url,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanSubmitFinalGradeView(APIView):
    """
    Dean inputs Presentation and Documentation scores, computing the 100% composite final grade:
    Advisor (25%) + UIL (25%) + Doc (25%) + Presentation (25%) = 100%.
    POST /api/v1/uil-profiles/dean/submit-final-grade/<uuid:team_id>/
    Body: {"presentation_score": 24.0, "documentation_score": 23.5}
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        pres = request.data.get("presentation_score")
        doc = request.data.get("documentation_score")

        if pres is not None:
            team.presentation_score = Decimal(str(pres))
        if doc is not None:
            team.documentation_score = Decimal(str(doc))

        total, letter = team.compute_composite_grade()
        team.save()

        return Response({
            "message": f"Final composite grade computed for team '{team.team_name}'.",
            "breakdown": {
                "advisor_score_25": str(team.advisor_score or "0.00"),
                "uil_score_25": str(team.uil_score or "0.00"),
                "documentation_score_25": str(team.documentation_score or "0.00"),
                "presentation_score_25": str(team.presentation_score or "0.00"),
                "final_composite_score_100": str(team.final_composite_score),
                "final_grade_letter": team.final_grade_letter,
            },
            "certificate_data": {
                "team_name": team.team_name,
                "project_title": team.project_title,
                "final_grade": team.final_grade_letter,
                "status": "COMPLETED",
            }
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanChatView(APIView):
    """
    List direct chat messages between Department Dean and an officially verified student.
    GET /api/v1/uil-profiles/dean/chat/<str:student_id>/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def get(self, request, student_id):
        student = get_object_or_404(UILStudentProfile, id=student_id)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "Communication channel is only active for students officially verified by their Department Dean."},
                status=status.HTTP_403_FORBIDDEN,
            )

        dean = request.user
        dean_univ = get_user_university(dean)
        dean_dept = get_user_department(dean)
        student_univ = get_student_profile_university(student)
        student_dept = get_student_profile_department(student)

        if not universities_match(student_univ, dean_univ):
            return Response(
                {"detail": f"Forbidden: You can only communicate with students from your university ({dean_univ})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_match = (
            departments_match(student_dept, dean_dept)
            or (student.user and departments_match(getattr(student.user, "department", ""), dean_dept))
        )
        if not is_match:
            return Response(
                {"detail": f"Forbidden: You can only communicate with verified students in your department ({dean_dept})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        student_user = student.user
        if not student_user:
            return Response({"detail": "Student user record not found."}, status=status.HTTP_404_NOT_FOUND)

        mark_read = request.query_params.get("mark_read", "true").lower() in ["true", "1"]
        if mark_read:
            TeamChannelMessage.objects.filter(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
                recipient=dean,
                sender=student_user,
                is_read=False,
            ).update(is_read=True, read_at=timezone.now())

        messages = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
        ).filter(
            (Q(sender=dean) & Q(recipient=student_user)) |
            (Q(sender=student_user) & Q(recipient=dean))
        ).order_by("created_at")

        data = [
            {
                "id": str(m.id),
                "sender_id": str(m.sender.id),
                "sender_name": m.sender.full_name or m.sender.email,
                "sender_role": m.sender.role,
                "is_mine": (m.sender == dean),
                "is_read": m.is_read,
                "message": m.message,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]

        unread_count = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            recipient=dean,
            sender=student_user,
            is_read=False,
        ).count()

        dean_title = format_dean_title(dean)
        return Response({
            "student": {
                "id": str(student.id),
                "student_id_number": student.student_id_number,
                "full_name": student_user.full_name or student.student_id_number,
                "email": student_user.email,
                "department": student.department,
                "academic_year": student.academic_year,
            },
            "dean_title": dean_title,
            "messages": data,
            "unread_count": unread_count,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Department Dean"])
class DeanChatSendView(APIView):
    """
    Send a message from Department Dean to an officially verified student.
    POST /api/v1/uil-profiles/dean/chat/<str:student_id>/send/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def post(self, request, student_id):
        student = get_object_or_404(UILStudentProfile, id=student_id)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "Communication channel is only active for students officially verified by their Department Dean."},
                status=status.HTTP_403_FORBIDDEN,
            )

        dean = request.user
        dean_univ = get_user_university(dean)
        dean_dept = get_user_department(dean)
        student_univ = get_student_profile_university(student)
        student_dept = get_student_profile_department(student)

        if not universities_match(student_univ, dean_univ):
            return Response(
                {"detail": f"Forbidden: You can only communicate with students from your university ({dean_univ})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_match = (
            departments_match(student_dept, dean_dept)
            or (student.user and departments_match(getattr(student.user, "department", ""), dean_dept))
        )
        if not is_match:
            return Response(
                {"detail": f"Forbidden: You can only communicate with verified students in your department ({dean_dept})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        message_text = request.data.get("message", "").strip()
        if not message_text:
            return Response({"detail": "Message text is required."}, status=status.HTTP_400_BAD_REQUEST)

        student_user = student.user
        if not student_user:
            return Response({"detail": "Student user record not found."}, status=status.HTTP_404_NOT_FOUND)

        dean_title = format_dean_title(dean)
        msg = TeamChannelMessage.objects.create(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            sender=dean,
            recipient=student_user,
            message=message_text,
        )

        create_notification(
            recipient=student_user,
            actor=dean,
            title=f"New Message from {dean_title}",
            message=message_text[:120],
            notification_type=Notification.NotificationType.CHAT,
            link="/student/dashboard?chat=true",
        )

        return Response({
            "id": str(msg.id),
            "sender_id": str(msg.sender.id),
            "sender_name": msg.sender.full_name or msg.sender.email,
            "sender_role": msg.sender.role,
            "is_mine": True,
            "is_read": False,
            "message": msg.message,
            "created_at": msg.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Students"])
class StudentDeanChatView(APIView):
    """
    List direct chat messages between authenticated verified student and their Department Dean.
    GET /api/v1/uil-profiles/student/dean-chat/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request):
        student = _get_or_create_uil_profile_for_user(request.user)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "Communication channel is only active after your Department Dean has officially verified your profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Locate verifying Dean
        dean_user = student.dean_user
        if not dean_user:
            from apps.logistics.models import CampusLogistics
            logistics = CampusLogistics.objects.filter(student=student, dean_approved=True).first()
            if logistics and logistics.dean_signed_by:
                dean_user = logistics.dean_signed_by
                student.dean_user = dean_user
                student.save(update_fields=["dean_user"])

        if not dean_user:
            stu_univ = get_student_profile_university(student)
            stu_dept = get_student_profile_department(student)
            for d in User.objects.filter(role=User.Role.DEPT_DEAN, is_active=True):
                d_univ = get_user_university(d)
                d_dept = get_user_department(d)
                if universities_match(stu_univ, d_univ) and departments_match(stu_dept, d_dept):
                    dean_user = d
                    student.dean_user = dean_user
                    student.save(update_fields=["dean_user"])
                    break

        if not dean_user:
            return Response(
                {"detail": f"Department Dean for {student.department} at your university not found or not yet assigned."},
                status=status.HTTP_404_NOT_FOUND,
            )

        dean_title = format_dean_title(dean_user)

        mark_read = request.query_params.get("mark_read", "").lower() in ["true", "1"]
        if mark_read:
            TeamChannelMessage.objects.filter(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
                recipient=request.user,
                sender=dean_user,
                is_read=False,
            ).update(is_read=True, read_at=timezone.now())

        messages = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
        ).filter(
            (Q(sender=request.user) & Q(recipient=dean_user)) |
            (Q(sender=dean_user) & Q(recipient=request.user))
        ).order_by("created_at")

        data = [
            {
                "id": str(m.id),
                "sender_id": str(m.sender.id),
                "sender_name": m.sender.full_name or m.sender.email,
                "sender_role": m.sender.role,
                "is_mine": (m.sender == request.user),
                "is_read": m.is_read,
                "message": m.message,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]

        unread_count = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            recipient=request.user,
            sender=dean_user,
            is_read=False,
        ).count()

        return Response({
            "dean": {
                "id": str(dean_user.id),
                "full_name": dean_user.full_name or f"Dean {dean_user.email}",
                "dean_title": dean_title,
                "email": dean_user.email,
                "department": dean_user.department or student.department,
            },
            "messages": data,
            "unread_count": unread_count,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Students"])
class StudentDeanChatSendView(APIView):
    """
    Send a message from verified student to their Department Dean.
    POST /api/v1/uil-profiles/student/dean-chat/send/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student = _get_or_create_uil_profile_for_user(request.user)
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "Communication channel is only active after your Department Dean has officially verified your profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        message_text = request.data.get("message", "").strip()
        if not message_text:
            return Response({"detail": "Message text is required."}, status=status.HTTP_400_BAD_REQUEST)

        dean_user = student.dean_user
        if not dean_user:
            from apps.logistics.models import CampusLogistics
            logistics = CampusLogistics.objects.filter(student=student, dean_approved=True).first()
            if logistics and logistics.dean_signed_by:
                dean_user = logistics.dean_signed_by
                student.dean_user = dean_user
                student.save(update_fields=["dean_user"])

        if not dean_user:
            stu_univ = get_student_profile_university(student)
            stu_dept = get_student_profile_department(student)
            for d in User.objects.filter(role=User.Role.DEPT_DEAN, is_active=True):
                d_univ = get_user_university(d)
                d_dept = get_user_department(d)
                if universities_match(stu_univ, d_univ) and departments_match(stu_dept, d_dept):
                    dean_user = d
                    student.dean_user = dean_user
                    student.save(update_fields=["dean_user"])
                    break

        if not dean_user:
            return Response(
                {"detail": f"Department Dean for {student.department} at your university not found or not yet assigned."},
                status=status.HTTP_404_NOT_FOUND,
            )

        msg = TeamChannelMessage.objects.create(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            sender=request.user,
            recipient=dean_user,
            message=message_text,
        )

        user_name = request.user.full_name or student.student_id_number
        create_notification(
            recipient=dean_user,
            actor=request.user,
            title=f"New Chat Message from {user_name}",
            message=message_text[:120],
            notification_type=Notification.NotificationType.CHAT,
            link=f"/dean/dashboard?student={student.id}&chat=true",
        )

        return Response({
            "id": str(msg.id),
            "sender_id": str(msg.sender.id),
            "sender_name": msg.sender.full_name or msg.sender.email,
            "sender_role": msg.sender.role,
            "is_mine": True,
            "is_read": False,
            "message": msg.message,
            "created_at": msg.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Department Dean"])
class DeanChatUnreadCountView(APIView):
    """
    Returns unread chat message counts across all students for the authenticated Department Dean.
    GET /api/v1/uil-profiles/dean/chat/unread-count/
    """
    permission_classes = [IsAuthenticated, IsDeptDean]

    def get(self, request):
        dean = request.user
        unread_msgs = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            recipient=dean,
            is_read=False,
        )
        total_unread = unread_msgs.count()

        sender_counts = (
            unread_msgs.values("sender_id")
            .annotate(count=Count("id"))
        )
        by_user = {str(item["sender_id"]): item["count"] for item in sender_counts}

        student_profiles = UILStudentProfile.objects.filter(
            student__user_id__in=[item["sender_id"] for item in sender_counts]
        ).select_related("student")
        by_student = {}
        for sp in student_profiles:
            s_uid = str(sp.student.user_id) if sp.student and sp.student.user_id else ""
            if s_uid in by_user:
                by_student[str(sp.id)] = by_user[s_uid]

        return Response({
            "total_unread": total_unread,
            "by_user": by_user,
            "by_student": by_student,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["UIL Officer Chat"])
class UILChatView(APIView):
    """
    List direct chat messages between UIL Officer and an officially verified student.
    GET /api/v1/uil-profiles/uil/chat/<str:student_id>/
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def get(self, request, student_id):
        student = get_object_or_404(UILStudentProfile, id=student_id)
        uil = request.user
        uil_univ = get_user_university(uil)
        student_univ = get_student_profile_university(student)

        if uil_univ and not universities_match(student_univ, uil_univ):
            return Response(
                {"detail": f"Forbidden: You can only communicate with students from your university ({uil_univ})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        student_user = getattr(student, "user", None)
        if not student_user and hasattr(student, "student"):
            student_user = getattr(student.student, "user", None)
        if not student_user:
            return Response({"detail": "Student user record not found."}, status=status.HTTP_404_NOT_FOUND)

        mark_read = request.query_params.get("mark_read", "true").lower() in ["true", "1"]
        if mark_read:
            TeamChannelMessage.objects.filter(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
                recipient=uil,
                sender=student_user,
                is_read=False,
            ).update(is_read=True, read_at=timezone.now())

        messages = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
        ).filter(
            (Q(sender=uil) & Q(recipient=student_user)) |
            (Q(sender=student_user) & Q(recipient=uil))
        ).order_by("created_at")

        data = [
            {
                "id": str(m.id),
                "sender_id": str(m.sender.id),
                "sender_name": m.sender.full_name or m.sender.email,
                "sender_role": m.sender.role,
                "is_mine": (m.sender == uil),
                "is_read": m.is_read,
                "message": m.message,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]

        unread_count = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            recipient=uil,
            sender=student_user,
            is_read=False,
        ).count()

        return Response({
            "student": {
                "id": str(student.id),
                "full_name": student_user.full_name or student_user.email,
                "student_id_number": student.student_id_number,
                "department": student.department,
                "academic_year": student.academic_year,
            },
            "unread_count": unread_count,
            "messages": data,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["UIL Officer Chat"])
class UILChatSendView(APIView):
    """
    Send a direct chat message from UIL Officer to a verified student.
    POST /api/v1/uil-profiles/uil/chat/<str:student_id>/send/
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def post(self, request, student_id):
        student = get_object_or_404(UILStudentProfile, id=student_id)
        uil = request.user
        uil_univ = get_user_university(uil)
        student_univ = get_student_profile_university(student)

        if uil_univ and not universities_match(student_univ, uil_univ):
            return Response(
                {"detail": f"Forbidden: You can only communicate with students from your university ({uil_univ})."},
                status=status.HTTP_403_FORBIDDEN,
            )

        student_user = getattr(student, "user", None)
        if not student_user and hasattr(student, "student"):
            student_user = getattr(student.student, "user", None)
        if not student_user:
            return Response({"detail": "Student user record not found."}, status=status.HTTP_404_NOT_FOUND)

        text = request.data.get("message", "").strip()
        if not text:
            return Response({"detail": "Message content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        msg = TeamChannelMessage.objects.create(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            sender=uil,
            recipient=student_user,
            message=text,
        )

        create_notification(
            recipient=student_user,
            actor=uil,
            title="New Chat Message from UIL Officer",
            message=f"UIL Officer sent you a direct message: {text[:80]}",
            notification_type=Notification.NotificationType.CHAT,
            link="/student/dashboard?chat=true&uil=true",
        )

        return Response({
            "id": str(msg.id),
            "sender_id": str(msg.sender.id),
            "sender_name": msg.sender.full_name or msg.sender.email,
            "sender_role": msg.sender.role,
            "is_mine": True,
            "is_read": False,
            "message": msg.message,
            "created_at": msg.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


@extend_schema(tags=["UIL Officer Chat"])
class UILChatUnreadCountView(APIView):
    """
    Returns unread chat message counts across all students for the authenticated UIL Officer.
    GET /api/v1/uil-profiles/uil/chat/unread-count/
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def get(self, request):
        uil = request.user
        unread_msgs = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            recipient=uil,
            is_read=False,
        )
        total_unread = unread_msgs.count()

        sender_counts = (
            unread_msgs.values("sender_id")
            .annotate(count=Count("id"))
        )
        by_user = {str(item["sender_id"]): item["count"] for item in sender_counts}

        student_profiles = UILStudentProfile.objects.filter(
            student__user_id__in=[item["sender_id"] for item in sender_counts]
        ).select_related("student")
        by_student = {}
        for sp in student_profiles:
            s_uid = str(sp.student.user_id) if sp.student and sp.student.user_id else ""
            if s_uid in by_user:
                by_student[str(sp.id)] = by_user[s_uid]

        return Response({
            "total_unread": total_unread,
            "by_user": by_user,
            "by_student": by_student,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Student UIL Chat"])
class StudentUILChatView(APIView):
    """
    List direct chat messages between authenticated student and their UIL Officer.
    GET /api/v1/uil-profiles/student/uil-chat/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request):
        student_user = request.user
        uil_profile = _get_or_create_uil_profile_for_user(student_user)
        student_univ = get_student_profile_university(uil_profile)

        # Check existing conversation to bind to the exact UIL Officer who communicated
        existing_msg = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
        ).filter(
            Q(sender=student_user) | Q(recipient=student_user)
        ).order_by("-created_at").first()

        target_uil = None
        if existing_msg:
            target_uil = existing_msg.recipient if existing_msg.sender == student_user else existing_msg.sender

        if not target_uil:
            uil_officers = User.objects.filter(role=User.Role.UIL_OFFICER, is_active=True)
            for uil in uil_officers:
                uil_univ = get_user_university(uil)
                if not student_univ or not uil_univ or universities_match(student_univ, uil_univ):
                    target_uil = uil
                    break
            if not target_uil:
                target_uil = uil_officers.first()

        if not target_uil:
            return Response({
                "uil_officer": None,
                "unread_count": 0,
                "messages": [],
            }, status=status.HTTP_200_OK)

        mark_read = request.query_params.get("mark_read", "").lower() in ["true", "1"]
        if mark_read and target_uil:
            TeamChannelMessage.objects.filter(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
                recipient=student_user,
                sender=target_uil,
                is_read=False,
            ).update(is_read=True, read_at=timezone.now())

        messages = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
        ).filter(
            (Q(sender=target_uil) & Q(recipient=student_user)) |
            (Q(sender=student_user) & Q(recipient=target_uil))
        ).order_by("created_at")

        data = [
            {
                "id": str(m.id),
                "sender_id": str(m.sender.id),
                "sender_name": m.sender.full_name or m.sender.email,
                "sender_role": m.sender.role,
                "is_mine": (m.sender == student_user),
                "is_read": m.is_read,
                "message": m.message,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]

        unread_count = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            recipient=student_user,
            sender=target_uil,
            is_read=False,
        ).count()

        uil_univ_name = get_user_university(target_uil) or getattr(target_uil, "university_name", "") or "University-Industry Linkage (UIL)"

        return Response({
            "uil_officer": {
                "id": str(target_uil.id),
                "name": target_uil.full_name or "UIL Head Officer",
                "email": target_uil.email,
                "university": uil_univ_name,
            },
            "unread_count": unread_count,
            "messages": data,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Student UIL Chat"])
class StudentUILChatSendView(APIView):
    """
    Send a direct chat message from student to their UIL Officer.
    POST /api/v1/uil-profiles/student/uil-chat/send/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student_user = request.user
        uil_profile = _get_or_create_uil_profile_for_user(student_user)
        student_univ = get_student_profile_university(uil_profile)

        existing_msg = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
        ).filter(
            Q(sender=student_user) | Q(recipient=student_user)
        ).order_by("-created_at").first()

        target_uil = None
        if existing_msg:
            target_uil = existing_msg.recipient if existing_msg.sender == student_user else existing_msg.sender

        if not target_uil:
            uil_officers = User.objects.filter(role=User.Role.UIL_OFFICER, is_active=True)
            for uil in uil_officers:
                uil_univ = get_user_university(uil)
                if not student_univ or not uil_univ or universities_match(student_univ, uil_univ):
                    target_uil = uil
                    break
            if not target_uil:
                target_uil = uil_officers.first()

        if not target_uil:
            return Response({"detail": "No active UIL Officer found."}, status=status.HTTP_404_NOT_FOUND)

        text = request.data.get("message", "").strip()
        if not text:
            return Response({"detail": "Message content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        msg = TeamChannelMessage.objects.create(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            sender=student_user,
            recipient=target_uil,
            message=text,
        )

        user_name = student_user.full_name or student_user.username
        create_notification(
            recipient=target_uil,
            actor=student_user,
            title=f"New Chat Message from {user_name}",
            message=f"Student {user_name} sent you an inquiry: {text[:80]}",
            notification_type=Notification.NotificationType.CHAT,
            link=f"/uil/dashboard?student={uil_profile.id}&chat=true",
        )

        return Response({
            "id": str(msg.id),
            "sender_id": str(msg.sender.id),
            "sender_name": user_name,
            "sender_role": student_user.role,
            "is_mine": True,
            "is_read": False,
            "message": msg.message,
            "created_at": msg.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Student Chat"])
class StudentChatUnreadCountView(APIView):
    """
    Returns total and per-channel unread chat message counts for the authenticated student.
    GET /api/v1/uil-profiles/student/chat-unread-count/
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request):
        student_user = request.user
        dean_unread = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_DEAN,
            recipient=student_user,
            is_read=False,
        ).count()
        uil_unread = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_UIL,
            recipient=student_user,
            is_read=False,
        ).count()
        return Response({
            "dean_unread": dean_unread,
            "uil_unread": uil_unread,
            "total_unread": dean_unread + uil_unread,
        }, status=status.HTTP_200_OK)



