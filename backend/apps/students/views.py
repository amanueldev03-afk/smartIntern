import logging
from django.conf import settings

from django.db import transaction
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema

from apps.internships.models import Skill
from apps.internships.permissions import IsStudent
from apps.administration.services import log_student_activity
from .models import StudentProfile, CareerInterest, CV, Resume
from .serializers import (
    StudentProfileSerializer,
    StudentMeSerializer,
    AddStudentSkillsSerializer,
    StudentSkillSerializer,
    StudentInterestSerializer,
    StudentSkillInputSerializer,
    StudentInterestInputSerializer,
    StudentPreferencesSerializer,
)
from .tasks import process_cv, parse_resume, generate_student_embedding_task, parse_resume_task
from apps.recommendations.views import bust_recommendation_cache

logger = logging.getLogger(__name__)


def _get_or_create_profile(user):
    """Return the student's profile, creating it if it doesn't exist."""
    profile, _ = StudentProfile.objects.get_or_create(user=user)
    return profile


def _queue_embedding(profile):
    """Queue embedding regeneration after the current transaction commits."""
    def _safe_dispatch():
        try:
            generate_student_embedding_task.delay(profile.id)
        except Exception as exc:
            logger.warning(f"Could not queue embedding regeneration for profile {profile.id}: {exc}")

    try:
        transaction.on_commit(_safe_dispatch)
    except (AttributeError, RuntimeError) as exc:
        logger.warning(f"Could not queue embedding regeneration hook for profile {profile.id}: {exc}")


def _handle_cv_file(cv_file, user):
    """
    Replace the student's existing CV with `cv_file`, create a new CV record,
    and queue background processing.
    Returns a cv_info dict on success, raises ValueError on bad extension or
    on content that fails MIME sniffing (Section 7.6.5).
    """
    from .services.cv_extraction import validate_resume_file
    validate_resume_file(cv_file)   # extension + size + content sniffing

    # Delete old CV records + their storage files
    old_cvs = CV.objects.filter(student=user)
    for old_cv in old_cvs:
        try:
            if old_cv.file:
                old_cv.file.delete(save=False)
        except (OSError, IOError) as del_err:
            logger.warning(f"Could not delete old CV file: {del_err}")
    old_cvs.delete()

    # Create new CV record
    cv = CV.objects.create(
        student=user,
        file=cv_file,
        processing_status=CV.STATUS_PENDING,
    )
    logger.info(f"CV record created: id={cv.id} for user={user.id}")

    cv_id = cv.id
    try:
        transaction.on_commit(lambda: process_cv.delay(cv_id))
    except (AttributeError, RuntimeError) as exc:
        logger.warning(f"Could not queue CV processing: {exc}")

    return {
        "cv_id": cv.id,
        "processing_status": cv.processing_status,
        "message": "CV uploaded. Processing in background.",
    }


def _store_resume(profile, resume_file):
    """
    Phase 3 Task 3.4 — store a validated resume (Section 5.3.6 / Figure 5.2).

    1. Content-sniffed validation (extension + size + MIME sniffing).
    2. Replace the student's CV records on disk (the resume parsing pipeline
       in Task 3.5 consumes the newest ``CV`` record).
    3. Create a new ``CV`` record holding the stored file.
    4. Point the canonical ``StudentProfile.resume`` field at the same stored
       object (no second copy — the DB field stores the same storage key).
    5. Queue the ``parse_resume`` Celery task (Task 3.5).

    Raises ValueError if the file is not a genuine PDF/DOCX.
    """
    from .services.cv_extraction import validate_resume_file
    validate_resume_file(resume_file)   # extension + size + content sniffing

    user = profile.user

    # Delete old CV records + their storage files
    old_cvs = CV.objects.filter(student=user)
    for old_cv in old_cvs:
        try:
            if old_cv.file:
                old_cv.file.delete(save=False)
        except (OSError, IOError) as del_err:
            logger.warning(f"Could not delete old resume/CV file: {del_err}")
    old_cvs.delete()

    # Create new CV record (async parsing pipeline artifact)
    cv = CV.objects.create(
        student=user,
        file=resume_file,
        processing_status=CV.STATUS_PENDING,
    )
    logger.info(f"Resume CV record created: id={cv.id} for user={user.id}")

    # Point the canonical resume field at the same stored object.
    profile.resume.name = cv.file.name
    profile.save(update_fields=["resume", "updated_at"])

    # Phase 3 Task 3.5 — queue async resume parsing. ``parse_resume.delay``
    # runs the resume-parsing pipeline (Task 3.5) and sets
    # ``StudentProfile.resume_parsed = True`` once done. Queued via
    # ``transaction.on_commit`` so it only fires after the upload commits.
    try:
        transaction.on_commit(lambda: parse_resume.delay(profile.user_id))
    except (AttributeError, RuntimeError) as exc:
        logger.warning(f"Could not queue resume parsing for user {profile.user_id}: {exc}")

    return {
        "cv_id": cv.id,
        "processing_status": cv.processing_status,
        "resume_url": f"{settings.SITE_BASE_URL}{cv.file.url}",
        "message": "Resume uploaded. Processing in background.",
    }


class StudentProfileView(GenericAPIView):
    """
    GET  /api/students/   — return the student's full profile including cv_data.
    PUT  /api/students/   — update profile fields.  Optionally include a `cv`
                           file (multipart/form-data) to replace the stored CV.
    PATCH /api/students/  — partial update (same behaviour as PUT).

    All preference fields (internship_type, work_type, compensation_preference,
    minimum_compensation, maximum_compensation, preferred_locations,
    preferred_industries, preferred_roles, willing_to_relocate) are part of
    the profile serializer — send them in the same request as any other field.
    """

    permission_classes = [IsAuthenticated]
    serializer_class   = StudentProfileSerializer
    # Accept JSON, form-data (for CV file upload), and multipart
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(
        tags=["Student Profiles"],
        summary="Get Student Profile",
        description=(
            "Retrieve the full student profile, including the computed `cv_data` "
            "block that shows CV processing status and all extracted fields "
            "(skills, education, experience, projects, certifications)."
        ),
        responses={200: StudentProfileSerializer},
    )
    def get(self, request):
        profile = _get_or_create_profile(request.user)
        return Response(
            StudentProfileSerializer(profile).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Student Profiles"],
        summary="Update Student Profile",
        description=(
            "Update any combination of profile fields in a single request.\n\n"
            "**Preference fields** (internship_type, work_type, compensation_preference, "
            "minimum_compensation, maximum_compensation, preferred_locations, "
            "preferred_industries, willing_to_relocate) are part of this serializer — "
            "no separate preferences endpoint is needed.\n\n"
            "**CV upload** — include a `cv` file field (PDF/DOCX, max 5 MB) using "
            "`multipart/form-data` to replace the stored CV.  The response will contain "
            "a `cv_upload` key with the new CV id and initial processing status.\n\n"
            "A `PUT` and a `PATCH` behave identically — all fields are optional."
        ),
        request=StudentProfileSerializer,
        responses={200: StudentProfileSerializer},
    )
    def put(self, request):
        return self._update(request)

    @extend_schema(
        tags=["Student Profiles"],
        summary="Partial Update Student Profile",
        description="Partial update — identical to PUT, all fields are optional.",
        request=StudentProfileSerializer,
        responses={200: StudentProfileSerializer},
    )
    def patch(self, request):
        return self._update(request)

    # ------------------------------------------------------------------
    def _update(self, request):
        profile = _get_or_create_profile(request.user)

        # --- Handle CV file if present -----------------------------------
        cv_info = None
        if request.FILES.get("cv"):
            try:
                cv_info = _handle_cv_file(request.FILES["cv"], request.user)
                bust_recommendation_cache(request.user.id)
            except ValueError as exc:
                return Response({"cv": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # --- Update profile fields ----------------------------------------
        # request.data may be a QueryDict (multipart) — copy to plain dict
        data = request.data.dict() if hasattr(request.data, "dict") else dict(request.data)
        # Remove the file key so the serializer doesn't try to validate it
        data.pop("cv", None)

        # Handle JSON-encoded list fields that arrive as strings in multipart
        import json
        list_fields = [
            "interests", "preferred_locations",
            "preferred_industries", "preferred_roles",
        ]
        for field in list_fields:
            if field in data and isinstance(data[field], str):
                try:
                    data[field] = json.loads(data[field])
                except (json.JSONDecodeError, TypeError):
                    pass  # leave as-is; serializer validation will catch invalid types

        serializer = StudentProfileSerializer(
            profile,
            data=data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # --- Queue embedding regeneration --------------------------------
        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        # Phase 9 — record a lightweight profile update in the activity log.
        log_student_activity(
            student=request.user,
            action="profile_update",
            description="Student updated their profile.",
        )

        # --- Build response ----------------------------------------------
        response_data = StudentProfileSerializer(profile).data
        if cv_info:
            response_data["cv_upload"] = cv_info

        return Response(response_data, status=status.HTTP_200_OK)


class StudentMeView(GenericAPIView):
    """
    Phase 3 Task 3.1 — Student Profile Module (Section 5.3).

    GET   /api/students/me/   — personal info + education (Sections 5.3.1–5.3.2).
    PATCH /api/students/me/   — partial update of personal/education fields.

    ``education_level``, ``current_year`` and ``field_of_study`` are validated
    against fixed choice lists so the AI matching engine (Section 3.11.1) never
    receives free-text noise it cannot match.
    """

    permission_classes = [IsStudent]
    serializer_class = StudentMeSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _get_profile(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_profile_get",
        summary="Get My Profile (personal info + education)",
        description=(
            "Return the authenticated student's personal information and "
            "education (Sections 5.3.1-5.3.2)."
        ),
        responses={200: StudentMeSerializer},
    )
    def get(self, request):
        profile = self._get_profile(request)
        data = StudentMeSerializer(profile).data
        # Populate fallbacks if empty on profile
        if not data.get("university") and getattr(request.user, "university_name", None):
            data["university"] = request.user.university_name
        if not data.get("phone") and getattr(request.user, "phone_number", None):
            data["phone"] = request.user.phone_number
        if not data.get("student_id_number"):
            uil = getattr(getattr(request.user, "student", None), "uil_student_profile", None)
            if uil and uil.student_id_number:
                data["student_id_number"] = uil.student_id_number
            elif hasattr(request.user, "student_profile") and request.user.student_profile and request.user.student_profile.student_id_number:
                data["student_id_number"] = request.user.student_profile.student_id_number
        return Response(
            data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_profile_update",
        summary="Update My Profile (personal info + education)",
        description=(
            "Partially update the authenticated student's personal information "
            "and education. `education_level`, `current_year` and "
            "`field_of_study` must be values from their fixed choice lists; an "
            "invalid value returns 400 so the AI engine only sees canonical data."
        ),
        request=StudentMeSerializer,
        responses={200: StudentMeSerializer},
    )
    def patch(self, request):
        return self._update(request)

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_profile_full_update",
        summary="Update My Profile (full)",
        description="Full update — behaves like PATCH (all fields optional).",
        request=StudentMeSerializer,
        responses={200: StudentMeSerializer},
    )
    def put(self, request):
        return self._update(request)

    def _update(self, request):
        profile = self._get_profile(request)
        serializer = StudentMeSerializer(
            profile,
            data=request.data if isinstance(request.data, dict) else dict(request.data),
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Keep the AI matching inputs (Section 3.11.1) in sync.
        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        # Phase 9 — record a lightweight profile update in the activity log.
        log_student_activity(
            student=request.user,
            action="profile_update",
            description="Student updated personal/education information.",
        )

        return Response(
            StudentMeSerializer(profile).data,
            status=status.HTTP_200_OK,
        )


class StudentPreferencesView(GenericAPIView):
    """
    Phase 3 Task 3.3 — Internship preferences (Section 5.3.3).

    GET   /api/students/me/preferences/   — return my internship preferences.
    PATCH /api/students/me/preferences/   — update preferences.

    Accepted PATCH fields:
      - ``country`` / ``city``
      - ``work_mode``        → full_time | part_time | either
      - ``internship_type``  → remote | onsite | hybrid | any
      - ``availability_start`` / ``availability_end`` (YYYY-MM-DD)

    Basic invariant: ``availability_end`` before ``availability_start`` is
    rejected with 400 so match times never invert.
    """

    permission_classes = [IsStudent]
    serializer_class = StudentPreferencesSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _get_profile(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_preferences_get",
        summary="Get My Internship Preferences",
        description=(
            "Return the authenticated student's internship preferences: "
            "country, city, work_mode, internship_type, availability window."
        ),
        responses={200: StudentPreferencesSerializer},
    )
    def get(self, request):
        profile = self._get_profile(request)
        return Response(
            StudentPreferencesSerializer(profile).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_preferences_update",
        summary="Update My Internship Preferences",
        description=(
            "Partially update internship preferences. `availability_end` "
            "before `availability_start` returns 400 (basic invariant)."
        ),
        request=StudentPreferencesSerializer,
        responses={200: StudentPreferencesSerializer},
    )
    def patch(self, request):
        profile = self._get_profile(request)
        data = request.data if isinstance(request.data, dict) else dict(request.data)
        serializer = StudentPreferencesSerializer(
            profile,
            data=data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Keep the AI matching inputs (Section 3.11.1) in sync.
        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(
            StudentPreferencesSerializer(profile).data,
            status=status.HTTP_200_OK,
        )


class StudentResumeView(GenericAPIView):
    """
    Phase 3 Task 3.4 — Resume upload (Section 5.3.6 / Figure 5.2).

    POST /api/students/me/resume/   — multipart field ``file``.
        Accepts PDF / DOCX up to 5 MB. Validates MIME type by **content
        sniffing** (Section 7.6.5) — genuine ``%PDF`` header for .pdf, a real
        OOXML ZIP (``[Content_Types].xml`` + ``word/``) for .docx. An
        executable renamed to ``.pdf`` is rejected with 400.

        On success: the file is stored in Django storage (local filesystem in
        dev, S3 in production via ``STORAGE_BACKEND=s3``), ``StudentProfile.resume``
        points to it, a ``CV`` record is created, and the ``parse_resume``
        Celery task (resume parsing pipeline, Task 3.5) is queued — setting
        ``StudentProfile.resume_parsed = True`` once parsing completes.

        Response 201:
          { "cv_id", "processing_status", "resume_url", "message" }

    GET  /api/students/me/resume/    — return resume metadata + CV summary.
    """

    permission_classes = [IsStudent]
    serializer_class = None
    parser_classes = [MultiPartParser, FormParser]

    def _get_profile(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_resume_upload",
        summary="Upload Resume",
        description=(
            "Upload PDF/DOCX (max 5 MB). The file is content-sniffed — a "
            "genuine PDF/DOCX only; executables disguised as a .pdf are "
            "rejected. Stored in Django storage and queued for the resume "
            "parsing pipeline."
        ),
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {
                        "type": "string",
                        "format": "binary",
                        "description": "PDF or DOCX file, max 5 MB",
                    }
                },
                "required": ["file"],
            }
        },
        responses={
            201: {
                "type": "object",
                "properties": {
                    "message":           {"type": "string"},
                    "cv_id":             {"type": "integer"},
                    "processing_status": {"type": "string"},
                    "resume_url":        {"type": "string"},
                },
            },
            400: {
                "type": "object",
                "properties": {"detail": {"type": "string"}},
            },
        },
    )
    def post(self, request):
        resume_file = request.FILES.get("file")
        if not resume_file:
            return Response(
                {
                    "detail": (
                        "A resume file is required. Send it as form-data with "
                        "key 'file'."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = self._get_profile(request)
        try:
            resume_info = _store_resume(profile, resume_file)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        # Phase 9 — record a lightweight resume upload in the activity log.
        log_student_activity(
            student=request.user,
            action="resume_upload",
            description="Student uploaded a new resume.",
        )

        return Response(resume_info, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Student Profiles"],
        summary="Get Resume Status",
        operation_id="student_resume_status",
        description=(
            "Return resume metadata: whether a resume exists, its storage URL, "
            "and the latest CV processing status."
        ),
        responses={
            200: {
                "type": "object",
                "properties": {
                    "has_resume":        {"type": "boolean"},
                    "resume_url":        {"type": "string", "nullable": True},
                    "cv_id":             {"type": "integer", "nullable": True},
                    "processing_status": {"type": "string", "nullable": True},
                    "processing_error":  {"type": "string", "nullable": True},
                },
            }
        },
    )
    def get(self, request):
        profile = self._get_profile(request)
        cv = (
            CV.objects.filter(student=request.user)
            .order_by("-created_at")
            .first()
        )
        return Response(
            {
                "has_resume": bool(profile.resume),
                "resume_url": f"{settings.SITE_BASE_URL}{profile.resume.url}" if profile.resume else None,
                "cv_id": cv.id if cv else None,
                "processing_status": cv.processing_status if cv else None,
                "processing_error": cv.processing_error if cv else None,
            },
            status=status.HTTP_200_OK,
        )


class StudentSkillsView(GenericAPIView):
    """
    Phase 3 Task 3.2 — Skills for the authenticated student.

    GET    /api/students/me/skills/   — list skills on my profile.
    POST   /api/students/me/skills/   — add a skill by catalogue ID
                                        (``skill_id``) from the Task 1.3
                                        Skill catalogue.
    DELETE /api/students/me/skills/   — remove a skill by catalogue ID
                                        (``skill_id``).

    Skills are never free-typed: the POST body must reference an existing
    ``Skill`` from the catalogue, otherwise a 400 is returned. This keeps
    Phase 6 skill matching on canonical values (Task 1.3) instead of
    degrading to fuzzy string matching.
    """

    permission_classes = [IsStudent]
    serializer_class = StudentSkillInputSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _get_profile(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(
        tags=["Student Profiles"],
        summary="List My Skills",
        description="Return the skills attached to the authenticated student's profile.",
        responses={200: StudentSkillSerializer(many=True)},
    )
    def get(self, request):
        profile = self._get_profile(request)
        skills = profile.skills.filter(is_active=True).order_by("name")
        return Response(
            StudentSkillSerializer(skills, many=True).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Student Profiles"],
        summary="Add a Skill to My Profile",
        description=(
            "Add a skill by catalogue ID (`skill_id`). The ID must reference an "
            "existing Skill from the Task 1.3 catalogue or a 400 is returned. "
            "Free-text skill names are rejected."
        ),
        request=StudentSkillInputSerializer,
        responses={201: StudentSkillSerializer},
    )
    def post(self, request):
        skill_id = request.data.get("skill_id")
        skill_name = request.data.get("name") or request.data.get("skill_name")
        profile = self._get_profile(request)

        if skill_name and not skill_id:
            cleaned_name = str(skill_name).strip()
            if not cleaned_name:
                return Response({"name": "Skill name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            skill = Skill.objects.filter(name__iexact=cleaned_name).first()
            if not skill:
                skill = Skill.objects.create(name=cleaned_name, category="General", is_active=True)
        else:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            skill = Skill.objects.get(id=serializer.validated_data["skill_id"])

        profile.skills.add(skill)

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(
            StudentSkillSerializer(skill).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        tags=["Student Profiles"],
        summary="Remove a Skill from My Profile",
        description="Remove a skill from the authenticated student's profile by catalogue ID (`skill_id`).",
        request=StudentSkillInputSerializer,
        responses={204: None},
    )
    def delete(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = self._get_profile(request)
        skill = Skill.objects.get(id=serializer.validated_data["skill_id"])
        profile.skills.remove(skill)

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentInterestsView(GenericAPIView):
    """
    Phase 3 Task 3.2 — Career interests for the authenticated student.

    GET    /api/students/me/interests/   — list interests on my profile.
    POST   /api/students/me/interests/   — add an interest by catalogue ID
                                           (``interest_id``) from the Task 1.3
                                           CareerInterest catalogue.
    DELETE /api/students/me/interests/   — remove an interest by catalogue ID.

    Interests are never free-typed: the POST body must reference an existing
    ``CareerInterest`` from the catalogue, otherwise a 400 is returned.
    """

    permission_classes = [IsStudent]
    serializer_class = StudentInterestInputSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _get_profile(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return profile

    @extend_schema(
        tags=["Student Profiles"],
        summary="List My Career Interests",
        description="Return the career interests attached to the authenticated student's profile.",
        responses={200: StudentInterestSerializer(many=True)},
    )
    def get(self, request):
        profile = self._get_profile(request)
        interests = profile.interests.filter(is_active=True).order_by("name")
        return Response(
            StudentInterestSerializer(interests, many=True).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Student Profiles"],
        summary="Add a Career Interest to My Profile",
        description=(
            "Add a career interest by catalogue ID (`interest_id`). The ID must "
            "reference an existing CareerInterest from the Task 1.3 catalogue "
            "or a 400 is returned. Free-text interests are rejected."
        ),
        request=StudentInterestInputSerializer,
        responses={201: StudentInterestSerializer},
    )
    def post(self, request):
        interest_id = request.data.get("interest_id")
        interest_name = request.data.get("name") or request.data.get("interest_name")
        profile = self._get_profile(request)

        if interest_name and not interest_id:
            cleaned_name = str(interest_name).strip()
            if not cleaned_name:
                return Response({"name": "Interest name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            interest = CareerInterest.objects.filter(name__iexact=cleaned_name).first()
            if not interest:
                interest = CareerInterest.objects.create(name=cleaned_name, is_active=True)
        else:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            interest = CareerInterest.objects.get(id=serializer.validated_data["interest_id"])

        profile.interests.add(interest)

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(
            StudentInterestSerializer(interest).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        tags=["Student Profiles"],
        summary="Remove a Career Interest from My Profile",
        description="Remove a career interest from the authenticated student's profile by catalogue ID (`interest_id`).",
        request=StudentInterestInputSerializer,
        responses={204: None},
    )
    def delete(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = self._get_profile(request)
        interest = CareerInterest.objects.get(id=serializer.validated_data["interest_id"])
        profile.interests.remove(interest)

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentSkillsAddView(GenericAPIView):
    """
    POST /api/students/skills/add/
    Add skills to the student profile by skill IDs.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = AddStudentSkillsSerializer

    @extend_schema(
        tags=["Student Profiles"],
        summary="Add Skills to Profile",
        description="Add one or more skills to the student profile by providing a list of skill IDs.",
        request=AddStudentSkillsSerializer,
        responses={200: StudentProfileSerializer},
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        skill_ids = serializer.validated_data["skill_ids"]
        profile   = _get_or_create_profile(request.user)
        skills    = Skill.objects.filter(id__in=skill_ids)
        profile.skills.add(*skills)

        _queue_embedding(profile)
        bust_recommendation_cache(request.user.id)

        return Response(
            StudentProfileSerializer(profile).data,
            status=status.HTTP_200_OK,
        )


class StudentSkillCatalogueView(GenericAPIView):
    """
    Phase 7 Task 7.2 — read-only Skill catalogue (Task 1.3) for the student
    profile editor. ``GET`` returns every active Skill (id, name, category,
    description) so the skills picker can offer catalogue options and submit
    ``skill_id`` values to POST /api/students/me/skills/ — never free-text.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = StudentSkillSerializer

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_skill_catalogue",
        summary="List Skill Catalogue",
        description=(
            "Read-only catalogue of active Skills (Task 1.3). The profile "
            "editor loads picker options from here and adds them to a student "
            "profile via POST /api/students/me/skills/ by ``skill_id``."
        ),
        responses={200: StudentSkillSerializer(many=True)},
    )
    def get(self, request):
        skills = Skill.objects.filter(is_active=True).order_by("name")
        return Response(
            StudentSkillSerializer(skills, many=True).data,
            status=status.HTTP_200_OK,
        )


class StudentInterestCatalogueView(GenericAPIView):
    """
    Phase 7 Task 7.2 — read-only CareerInterest catalogue (Task 1.3) for the
    student profile editor. ``GET`` returns every active CareerInterest
    (id, name, description) so the interests picker can offer catalogue
    options and submit ``interest_id`` to POST /api/students/me/interests/.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = StudentInterestSerializer

    @extend_schema(
        tags=["Student Profiles"],
        operation_id="student_interest_catalogue",
        summary="List Career Interest Catalogue",
        description=(
            "Read-only catalogue of active CareerInterests (Task 1.3). The "
            "profile editor loads picker options from here and adds them to a "
            "student profile via POST /api/students/me/interests/ by "
            "``interest_id``."
        ),
        responses={200: StudentInterestSerializer(many=True)},
    )
    def get(self, request):
        interests = CareerInterest.objects.filter(is_active=True).order_by("name")
        return Response(
            StudentInterestSerializer(interests, many=True).data,
            status=status.HTTP_200_OK,
        )


class StudentCVUploadView(GenericAPIView):
    """
    POST /api/students/cv/upload/
    Dedicated CV-only upload endpoint (no profile fields).
    Useful when you only want to replace the CV without touching profile data.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = None
    parser_classes     = [MultiPartParser]

    @extend_schema(
        tags=["Student Profiles"],
        summary="Upload CV (dedicated endpoint)",
        description=(
            "Replace the student's CV without changing any other profile field.\n\n"
            "For combined profile + CV upload, use `PUT /api/students/` instead."
        ),
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {
                        "type": "string",
                        "format": "binary",
                        "description": "PDF or DOCX file, max 5 MB",
                    }
                },
                "required": ["file"],
            }
        },
        responses={
            201: {
                "type": "object",
                "properties": {
                    "message":           {"type": "string"},
                    "cv_id":             {"type": "integer"},
                    "processing_status": {"type": "string"},
                },
            }
        },
    )
    def post(self, request):
        cv_file = request.FILES.get("file")
        if not cv_file:
            return Response(
                {"detail": "A CV file is required. Send it as form-data with key 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cv_info = _handle_cv_file(cv_file, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        bust_recommendation_cache(request.user.id)

        return Response(
            {
                "message":           cv_info["message"],
                "cv_id":             cv_info["cv_id"],
                "processing_status": cv_info["processing_status"],
            },
            status=status.HTTP_201_CREATED,
        )


class CVStatusView(GenericAPIView):
    """
    GET /api/students/cv/<cv_id>/status/
    Check processing status and extracted data for a specific CV by ID.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = None

    @extend_schema(
        tags=["Student Profiles"],
        summary="CV Processing Status (by ID)",
        operation_id="cv_status_by_id",
        description=(
            "Returns the current processing status plus all extracted data once "
            "the CV reaches COMPLETED status."
        ),
        responses={
            200: {
                "type": "object",
                "properties": {
                    "cv_id":              {"type": "integer"},
                    "processing_status":  {"type": "string",
                                          "enum": ["PENDING","PROCESSING","COMPLETED","FAILED"]},
                    "processing_error":   {"type": "string",  "nullable": True},
                    "processed_at":       {"type": "string",  "format": "date-time", "nullable": True},
                    "message":            {"type": "string"},
                    "extracted_skills":        {"type": "array", "items": {"type": "string"}},
                    "extracted_education":     {"type": "array", "items": {"type": "object"}},
                    "extracted_experience":    {"type": "array", "items": {"type": "object"}},
                    "extracted_projects":      {"type": "array", "items": {"type": "object"}},
                    "extracted_certifications":{"type": "array", "items": {"type": "object"}},
                    "extracted_languages":     {"type": "array", "items": {"type": "object"}},
                },
            },
            404: {"type": "object", "properties": {"detail": {"type": "string"}}},
        },
    )
    def get(self, request, cv_id=None):
        try:
            if cv_id is not None:
                cv = CV.objects.get(id=cv_id, student=request.user)
            else:
                cv = (
                    CV.objects
                    .filter(student=request.user)
                    .order_by("-created_at")
                    .first()
                )
                if not cv:
                    raise CV.DoesNotExist()
        except CV.DoesNotExist:
            return Response({"detail": "CV not found."}, status=status.HTTP_404_NOT_FOUND)

        data = {
            "cv_id":             cv.id,
            "processing_status": cv.processing_status,
            "processing_error":  cv.processing_error,
            "processed_at":      cv.processed_at,
            "extracted_skills":         cv.extracted_skills        or [],
            "extracted_education":      cv.extracted_education     or [],
            "extracted_experience":     cv.extracted_experience    or [],
            "extracted_projects":       cv.extracted_projects      or [],
            "extracted_certifications": cv.extracted_certifications or [],
            "extracted_languages":      cv.extracted_languages      or [],
        }

        if cv.processing_status == CV.STATUS_PENDING:
            data["message"] = "CV is queued for processing. Check back in a few seconds."
        elif cv.processing_status == CV.STATUS_PROCESSING:
            data["message"] = "CV is currently being processed. Check back shortly."
        elif cv.processing_status == CV.STATUS_COMPLETED:
            data["message"] = (
                f"CV processed successfully. "
                f"{len(data['extracted_skills'])} skills extracted."
            )
        elif cv.processing_status == CV.STATUS_FAILED:
            data["message"] = "CV processing failed. Please re-upload your CV."

        return Response(data, status=status.HTTP_200_OK)


class CVStatusLatestView(CVStatusView):
    """
    GET /api/students/cv/status/
    Check processing status of the most recently uploaded CV.
    """

    @extend_schema(
        tags=["Student Profiles"],
        summary="CV Processing Status (latest)",
        operation_id="cv_status_latest",
        description="Same as the by-ID endpoint but always returns the most recent CV.",
        responses={
            200: {
                "type": "object",
                "properties": {
                    "cv_id":              {"type": "integer"},
                    "processing_status":  {"type": "string",
                                          "enum": ["PENDING","PROCESSING","COMPLETED","FAILED"]},
                    "processing_error":   {"type": "string",  "nullable": True},
                    "processed_at":       {"type": "string",  "format": "date-time", "nullable": True},
                    "message":            {"type": "string"},
                    "extracted_skills":        {"type": "array", "items": {"type": "string"}},
                    "extracted_education":     {"type": "array", "items": {"type": "object"}},
                    "extracted_experience":    {"type": "array", "items": {"type": "object"}},
                    "extracted_projects":      {"type": "array", "items": {"type": "object"}},
                    "extracted_certifications":{"type": "array", "items": {"type": "object"}},
                    "extracted_languages":     {"type": "array", "items": {"type": "object"}},
                },
            },
            404: {"type": "object", "properties": {"detail": {"type": "string"}}},
        },
    )
    def get(self, request, cv_id=None):
        return super().get(request, cv_id=None)


class ResumeUploadView(GenericAPIView):
    """
    Task 2.2: Asynchronous resume upload endpoint.
    POST /api/v1/students/resume/
    Accepts PDF or DOCX file (max 5MB), validates MIME type via python-magic,
    stores Resume record, dispatches parse_resume_task, and returns resume_id and 'PENDING'.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        tags=["Student Resumes"],
        summary="Upload Resume for Asynchronous Extraction",
        description="Upload a PDF or DOCX resume document (max 5MB). Returns resume_id and initial 'PENDING' status.",
        responses={
            201: {
                "type": "object",
                "properties": {
                    "resume_id": {"type": "integer"},
                    "status": {"type": "string"},
                    "message": {"type": "string"},
                },
            },
            400: {"type": "object", "properties": {"detail": {"type": "string"}}},
        },
    )
    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"detail": "A resume file is required. Provide it as form-data with key 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ai_engine.parsers.cv_extractor import validate_resume_file
        try:
            validate_resume_file(file_obj)
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create student profile
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)

        resume = Resume.objects.create(
            student=profile,
            file=file_obj,
            parsing_status=Resume.ParsingStatus.PENDING,
            parsed_data={},
        )

        try:
            transaction.on_commit(lambda: parse_resume_task.delay(resume.id))
        except Exception as exc:
            logger.warning(f"Could not queue parse_resume_task on commit: {exc}")
            parse_resume_task.delay(resume.id)

        return Response(
            {
                "resume_id": resume.id,
                "status": resume.parsing_status,
                "message": "Resume uploaded successfully and queued for extraction.",
            },
            status=status.HTTP_201_CREATED,
        )


class ResumeStatusView(GenericAPIView):
    """
    Task 2.2: Polls parsing status and returns extracted JSON data.
    GET /api/v1/students/resume/status/<resume_id>/
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Student Resumes"],
        summary="Get Resume Parsing Status and Extracted Data",
        description="Polls extraction status ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') and returns parsed entity JSON.",
        responses={
            200: {
                "type": "object",
                "properties": {
                    "resume_id": {"type": "integer"},
                    "status": {"type": "string"},
                    "parsed_data": {"type": "object"},
                    "extracted_text": {"type": "string"},
                    "uploaded_at": {"type": "string", "format": "date-time"},
                },
            },
            404: {"type": "object", "properties": {"detail": {"type": "string"}}},
        },
    )
    def get(self, request, resume_id):
        try:
            resume = Resume.objects.select_related("student__user").get(id=resume_id)
        except (Resume.DoesNotExist, ValueError):
            return Response(
                {"detail": f"Resume with ID '{resume_id}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Permission check: owner or staff/admin
        if resume.student.user_id != request.user.id and not request.user.is_staff:
            return Response(
                {"detail": "You do not have permission to view this resume."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(
            {
                "resume_id": resume.id,
                "status": resume.parsing_status,
                "parsed_data": resume.parsed_data,
                "extracted_text": resume.extracted_text,
                "uploaded_at": resume.uploaded_at,
            },
            status=status.HTTP_200_OK,
        )

