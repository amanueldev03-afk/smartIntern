from django.conf import settings
from rest_framework import serializers

from .models import (
    StudentProfile,
    StudentCV,
    CareerInterest,
    CV as CVModel,
)
from apps.internships.models import Skill

from apps.internships.services.embedding_service import (
    regenerate_student_embedding,
)


def _get_cv_data(profile) -> dict:
    """
    Build a merged CV data block for a StudentProfile instance.

    Priority:
      1. Newest completed CV model (async Celery pipeline)
      2. Any CV model record (still processing / failed)
      3. Legacy StudentCV record

    Returned dict is always present; `has_cv` tells the caller whether
    any CV has been uploaded.
    """
    user = getattr(profile, "user", None)
    if not user:
        return {"has_cv": False}

    try:
        # 1 — newest completed async CV
        cv = (
            CVModel.objects
            .filter(student=user, processing_status=CVModel.STATUS_COMPLETED)
            .order_by("-created_at")
            .first()
        )

        # 2 — any async CV (still processing or failed)
        if not cv:
            cv = (
                CVModel.objects
                .filter(student=user)
                .order_by("-created_at")
                .first()
            )

        # 3 — legacy StudentCV
        if not cv:
            cv = StudentCV.objects.filter(student=user).first()

        if not cv:
            return {"has_cv": False, "message": "No CV uploaded yet."}

        proc_status = getattr(cv, "processing_status", "COMPLETED")

        # Merge: manual profile skills + CV extracted skills (deduplicated)
        profile_skill_names = list(
            profile.skills.values_list("name", flat=True)
        )
        cv_extracted_skills = getattr(cv, "extracted_skills", []) or []

        seen = set()
        merged_skills = []
        for s in profile_skill_names + cv_extracted_skills:
            key = str(s).lower().strip()
            if key and key not in seen:
                seen.add(key)
                merged_skills.append(s)

        uploaded_at = (
            getattr(cv, "uploaded_at", None)
            or getattr(cv, "created_at", None)
        )

        return {
            "has_cv":            True,
            "processing_status": proc_status,
            # merged: profile manual + CV extracted (deduplicated)
            "merged_skills":     merged_skills,
            # raw CV extracted fields
            "extracted_skills":        cv_extracted_skills,
            "extracted_education":     getattr(cv, "extracted_education",     []) or [],
            "extracted_experience":    getattr(cv, "extracted_experience",    []) or [],
            "extracted_projects":      getattr(cv, "extracted_projects",      []) or [],
            "extracted_certifications": getattr(cv, "extracted_certifications", []) or [],
            "extracted_languages":     getattr(cv, "extracted_languages",     []) or [],
            "uploaded_at": (
                uploaded_at.isoformat() if uploaded_at else None
            ),
        }

    except Exception:
        return {"has_cv": False, "message": "CV data temporarily unavailable."}


class StudentProfileSerializer(serializers.ModelSerializer):
    """
    Full profile serializer.

    `cv_data` is a read-only computed field that exposes:
      - whether a CV has been uploaded and its processing status
      - raw extracted fields (skills, education, experience, projects, certs)
      - merged_skills: manual profile skills + CV-extracted skills, deduplicated
    """

    user = serializers.PrimaryKeyRelatedField(read_only=True)

    # File fields with absolute URLs for cross-origin access
    cv = serializers.SerializerMethodField(
        help_text="Absolute URL to the CV file."
    )
    resume = serializers.SerializerMethodField(
        help_text="Absolute URL to the resume file."
    )

    # Read-only computed field — not stored on the model
    cv_data = serializers.SerializerMethodField(
        help_text=(
            "CV processing status and extracted data merged with manual profile skills."
        )
    )

    # Phase 3 Task 3.6 — profile completion indicator (Sections 3.9.1/3.9.2).
    # Read-only, computed from how many of the six key sections are filled
    # (personal, education, skills, interests, preferences, resume).
    completion = serializers.SerializerMethodField(
        help_text=(
            "Profile completion percentage and per-section breakdown "
            "powering the dashboard completion widget."
        )
    )

    def get_cv(self, obj) -> str | None:
        if obj.cv:
            return f"{settings.SITE_BASE_URL}{obj.cv.url}"
        return None

    def get_resume(self, obj) -> str | None:
        if obj.resume:
            return f"{settings.SITE_BASE_URL}{obj.resume.url}"
        return None

    def get_cv_data(self, obj) -> dict:
        return _get_cv_data(obj)

    def get_completion(self, obj) -> dict:
        from .services.profile_completion import compute_profile_completion
        return compute_profile_completion(obj)

    def perform_create(self, serializer):
        profile = serializer.save()
        regenerate_student_embedding(profile)

    class Meta:
        model = StudentProfile

        fields = [
            "id",
            "user",

            # Personal
            "phone",
            "country",
            "city",
            "date_of_birth",
            "bio",

            # Education
            "education_level",
            "field_of_study",
            "university",
            "student_id_number",
            "gpa",

            # Skills & experience (read-only — use POST /api/students/skills/add/
            # or /api/students/me/skills/ to change)
            "skills",
            "interests",
            "experience",

            # Preferences
            "internship_type",
            "work_type",
            "compensation_preference",
            "minimum_compensation",
            "maximum_compensation",
            "compensation_currency",

            # Location
            "preferred_locations",
            "willing_to_relocate",

            # Career
            "preferred_industries",
            "preferred_roles",

            # Duration / availability
            "internship_duration_min_weeks",
            "internship_duration_max_weeks",
            "availability_start",
            "availability_end",
            "availability_immediately",

            # CV file (raw upload path)
            "cv",
            # Resume (managed exclusively via /api/students/me/resume/)
            "resume",

            # Computed CV data block
            "cv_data",

            # Phase 3 Task 3.6 — completion indicator
            "completion",

            # Timestamps
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "user",
            "skills",        # managed via POST /api/students/skills/add/ only
            "interests",     # managed via /api/students/me/interests/ only
            "cv_data",
            "completion",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        compensation_preference = attrs.get(
            "compensation_preference",
            getattr(self.instance, "compensation_preference", "either"),
        )
        minimum_compensation = attrs.get(
            "minimum_compensation",
            getattr(self.instance, "minimum_compensation", None),
        )
        maximum_compensation = attrs.get(
            "maximum_compensation",
            getattr(self.instance, "maximum_compensation", None),
        )

        if compensation_preference == "paid":
            if minimum_compensation is None:
                raise serializers.ValidationError({
                    "minimum_compensation": (
                        "Minimum compensation is required for paid internships."
                    )
                })
            if maximum_compensation is None:
                raise serializers.ValidationError({
                    "maximum_compensation": (
                        "Maximum compensation is required for paid internships."
                    )
                })
            if minimum_compensation > maximum_compensation:
                raise serializers.ValidationError({
                    "maximum_compensation": (
                        "Maximum compensation must be greater than or equal "
                        "to minimum compensation."
                    )
                })

        min_duration = attrs.get(
            "internship_duration_min_weeks",
            getattr(self.instance, "internship_duration_min_weeks", None),
        )
        max_duration = attrs.get(
            "internship_duration_max_weeks",
            getattr(self.instance, "internship_duration_max_weeks", None),
        )

        if (
            min_duration is not None
            and max_duration is not None
            and min_duration > max_duration
        ):
            raise serializers.ValidationError({
                "internship_duration_max_weeks": (
                    "Maximum duration must be greater than or equal "
                    "to minimum duration."
                )
            })

        # Student ID uniqueness per university
        student_id_number = (attrs.get("student_id_number") or getattr(self.instance, "student_id_number", "") or "").strip()
        university = (attrs.get("university") or getattr(self.instance, "university", "") or "").strip()
        if student_id_number and university:
            try:
                from apps.uil_profiles.utils import universities_match
                from apps.students.models import StudentProfile
                qs = StudentProfile.objects.filter(student_id_number__iexact=student_id_number)
                if self.instance and self.instance.pk:
                    qs = qs.exclude(pk=self.instance.pk)
                for existing in qs:
                    existing_univ = existing.university or (getattr(existing.user, "university_name", "") if getattr(existing, "user", None) else "")
                    if universities_match(existing_univ, university):
                        raise serializers.ValidationError({
                            "student_id_number": f"A student with ID '{student_id_number}' already exists at {university}."
                        })
            except serializers.ValidationError:
                raise
            except Exception:
                pass

        return attrs

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        sync_student_to_uil_profile(instance)
        return instance


def sync_student_to_uil_profile(profile):
    """
    Keep StudentProfile in sync with UILStudentProfile and user records so that
    Department Dean and UIL Officer dashboards always reflect the latest
    academic data (student_id_number, department, gpa, academic_year, campus_city).
    """
    user = getattr(profile, "user", None)
    if not user:
        return
    try:
        from apps.uil_profiles.models import UILStudentProfile
        from apps.students.models import Student as LegacyStudent, StudentProfile
        from apps.accounts.models import StudentProfile as AccStudentProfile

        dept_val = profile.field_of_study or getattr(user, "department", "") or ""
        for code, label in StudentProfile.FIELD_OF_STUDY_CHOICES:
            if code == dept_val.lower().strip() or label.lower() == dept_val.lower().strip():
                dept_val = label
                break

        legacy_stu, _ = LegacyStudent.objects.get_or_create(user=user)
        uil_prof, _ = UILStudentProfile.objects.get_or_create(
            student=legacy_stu,
            defaults={
                "student_id_number": profile.student_id_number or f"UGR/{user.id.hex[:4].upper()}/16",
                "department": dept_val or "Computer Science",
                "academic_year": 4,
                "campus_city": profile.university or getattr(user, "university_name", "") or profile.city or "Addis Ababa",
            },
        )
        changed = False
        if profile.student_id_number and uil_prof.student_id_number != profile.student_id_number:
            uil_prof.student_id_number = profile.student_id_number
            changed = True
        if profile.gpa is not None and uil_prof.gpa != profile.gpa:
            uil_prof.gpa = profile.gpa
            changed = True
        if dept_val and uil_prof.department != dept_val:
            uil_prof.department = dept_val
            changed = True
        if not uil_prof.campus_city:
            uil_prof.campus_city = profile.university or getattr(user, "university_name", "") or profile.city or "Addis Ababa"
            changed = True

        year_map = {
            "first_year": 1,
            "second_year": 2,
            "third_year": 3,
            "fourth_year": 4,
            "final_year": 5,
            "graduate": 5,
        }
        if profile.current_year in year_map:
            mapped_yr = year_map[profile.current_year]
            if uil_prof.academic_year != mapped_yr:
                uil_prof.academic_year = mapped_yr
                changed = True

        if changed:
            uil_prof.save()

        # Also sync to accounts.StudentProfile if it exists
        if hasattr(user, "student_profile") and user.student_profile:
            acc_sp = user.student_profile
            acc_changed = False
            if profile.student_id_number and acc_sp.student_id_number != profile.student_id_number:
                acc_sp.student_id_number = profile.student_id_number
                acc_changed = True
            if profile.university and acc_sp.university_name != profile.university:
                acc_sp.university_name = profile.university
                acc_changed = True
            if profile.gpa is not None and acc_sp.gpa != profile.gpa:
                acc_sp.gpa = profile.gpa
                acc_changed = True
            if dept_val and acc_sp.department != dept_val:
                acc_sp.department = dept_val
                acc_changed = True
            if acc_changed:
                acc_sp.save()

        # Sync to user model fields
        user_updates = []
        if dept_val and getattr(user, "department", "") != dept_val:
            user.department = dept_val
            user_updates.append("department")
        if profile.university and getattr(user, "university_name", "") != profile.university:
            user.university_name = profile.university
            user_updates.append("university_name")
        if profile.phone and getattr(user, "phone_number", "") != profile.phone:
            user.phone_number = profile.phone
            user_updates.append("phone_number")
        if user_updates:
            user.save(update_fields=user_updates)

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to sync to UILStudentProfile: %s", exc)


class StudentMeSerializer(serializers.ModelSerializer):
    """
    Phase 3 Task 3.1 — personal info + education for the authenticated
    student (Sections 5.3.1–5.3.2), exposed at ``GET/PATCH /api/students/me/``.

    ``education_level``, ``current_year`` and ``field_of_study`` are restricted
    to fixed choice lists so the AI matching engine (Section 3.11.1) only ever
    sees canonical values instead of free-text noise.
    """

    education_level = serializers.ChoiceField(
        choices=StudentProfile.EDUCATION_LEVEL_CHOICES,
        allow_blank=True,
        required=False,
        help_text="Level of education (fixed choice list).",
    )
    current_year = serializers.ChoiceField(
        choices=StudentProfile.CURRENT_YEAR_CHOICES,
        allow_blank=True,
        required=False,
        help_text="Current academic year or status (fixed choice list).",
    )
    field_of_study = serializers.ChoiceField(
        choices=StudentProfile.FIELD_OF_STUDY_CHOICES,
        allow_blank=True,
        required=False,
        help_text="Field of study (fixed choice list).",
    )

    # Phase 3 Task 3.6 — profile completion indicator (Sections 3.9.1/3.9.2).
    completion = serializers.SerializerMethodField(
        help_text=(
            "Profile completion percentage and per-section breakdown "
            "powering the dashboard completion widget."
        )
    )

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)

        # Normalize education_level
        if "education_level" in data and data["education_level"]:
            raw_edu = str(data["education_level"]).strip().lower().replace(" ", "_")
            for code, label in StudentProfile.EDUCATION_LEVEL_CHOICES:
                if raw_edu == code or raw_edu == label.lower().replace(" ", "_"):
                    data["education_level"] = code
                    break

        # Normalize current_year
        if "current_year" in data and data["current_year"]:
            raw_yr = str(data["current_year"]).strip().lower().replace(" ", "_")
            year_num_map = {
                "1": "first_year",
                "2": "second_year",
                "3": "third_year",
                "4": "fourth_year",
                "5": "final_year",
            }
            if raw_yr in year_num_map:
                data["current_year"] = year_num_map[raw_yr]
            else:
                for code, label in StudentProfile.CURRENT_YEAR_CHOICES:
                    if raw_yr == code or raw_yr == label.lower().replace(" ", "_"):
                        data["current_year"] = code
                        break

        # Normalize field_of_study
        if "field_of_study" in data and data["field_of_study"]:
            raw_fos = str(data["field_of_study"]).strip().lower().replace(" ", "_")
            matched = False
            for code, label in StudentProfile.FIELD_OF_STUDY_CHOICES:
                if raw_fos == code or raw_fos == label.lower().replace(" ", "_"):
                    data["field_of_study"] = code
                    matched = True
                    break
            if not matched:
                for code, label in StudentProfile.FIELD_OF_STUDY_CHOICES:
                    if raw_fos in code or raw_fos in label.lower():
                        data["field_of_study"] = code
                        matched = True
                        break

        # Normalize gpa
        if "gpa" in data:
            if data["gpa"] == "" or data["gpa"] is None:
                data["gpa"] = None

        # Normalize date_of_birth
        if "date_of_birth" in data:
            if data["date_of_birth"] == "" or data["date_of_birth"] is None:
                data["date_of_birth"] = None
            elif isinstance(data["date_of_birth"], str) and "T" in data["date_of_birth"]:
                data["date_of_birth"] = data["date_of_birth"].split("T")[0]

        return super().to_internal_value(data)

    def get_completion(self, obj) -> dict:
        from .services.profile_completion import compute_profile_completion
        return compute_profile_completion(obj)

    def validate_gpa(self, value):
        if value is not None and not (0.0 <= float(value) <= 4.0):
            raise serializers.ValidationError("GPA must be between 0.00 and 4.00.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        student_id_number = (
            attrs.get("student_id_number")
            or getattr(self.instance, "student_id_number", "")
            or ""
        ).strip()
        university = (
            attrs.get("university")
            or getattr(self.instance, "university", "")
            or ""
        ).strip()
        user = getattr(self.instance, "user", None) or getattr(self.context.get("request"), "user", None)
        if not university and user:
            university = getattr(user, "university_name", "").strip()

        if student_id_number and university:
            try:
                from apps.uil_profiles.utils import universities_match
                from apps.students.models import StudentProfile
                qs = StudentProfile.objects.filter(student_id_number__iexact=student_id_number)
                if self.instance and self.instance.pk:
                    qs = qs.exclude(pk=self.instance.pk)
                if user:
                    qs = qs.exclude(user=user)
                for existing in qs:
                    existing_univ = existing.university or (
                        getattr(existing.user, "university_name", "")
                        if getattr(existing, "user", None)
                        else ""
                    )
                    if universities_match(existing_univ, university):
                        raise serializers.ValidationError({
                            "student_id_number": f"A student with ID '{student_id_number}' already exists at {university}."
                        })

                from apps.uil_profiles.models import UILStudentProfile
                uil_qs = UILStudentProfile.objects.filter(student_id_number__iexact=student_id_number)
                if user:
                    uil_qs = uil_qs.exclude(student__user=user)
                for uil_ex in uil_qs:
                    from apps.uil_profiles.utils import get_student_profile_university
                    uil_univ = get_student_profile_university(uil_ex)
                    if universities_match(uil_univ, university):
                        raise serializers.ValidationError({
                            "student_id_number": f"A student with ID '{student_id_number}' already exists at {university}."
                        })

                from apps.accounts.models import StudentProfile as AccStudentProfile
                acc_qs = AccStudentProfile.objects.filter(student_id_number__iexact=student_id_number)
                if user:
                    acc_qs = acc_qs.exclude(user=user)
                for acc_ex in acc_qs:
                    if universities_match(acc_ex.university_name, university):
                        raise serializers.ValidationError({
                            "student_id_number": f"A student with ID '{student_id_number}' already exists at {university}."
                        })
            except serializers.ValidationError:
                raise
            except Exception:
                pass

        return attrs

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        sync_student_to_uil_profile(instance)
        return instance

    class Meta:
        model = StudentProfile
        fields = [
            "id",
            # Personal info (Section 5.3.1)
            "phone",
            "country",
            "city",
            "date_of_birth",
            "bio",
            # Education (Section 5.3.2)
            "education_level",
            "current_year",
            "field_of_study",
            "university",
            "student_id_number",
            "gpa",
            # Completion indicator (Task 3.6)
            "completion",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "completion", "created_at", "updated_at"]


class StudentCVSerializer(serializers.ModelSerializer):

    class Meta:
        model = StudentCV
        fields = (
            "id",
            "file",
            "extracted_skills",
            "extracted_education",
            "extracted_experience",
            "extracted_projects",
            "extracted_certifications",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "extracted_skills",
            "extracted_education",
            "extracted_experience",
            "extracted_projects",
            "extracted_certifications",
            "created_at",
            "updated_at",
        )


class AddStudentSkillsSerializer(serializers.Serializer):
    """Add skills to a student profile by skill IDs."""

    skill_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of skill IDs to add to the profile.",
    )


class StudentPreferencesSerializer(serializers.ModelSerializer):
    """
    Phase 3 Task 3.3 — internship preferences (Section 5.3.3).

    ``PATCH /api/students/me/preferences/`` — country, city, work_mode,
    internship_type, availability_start / availability_end.

    Field mapping onto the canonical ``StudentProfile`` consumed by the AI
    engine (recommendation_engine_v2):

    - ``work_mode``       → model ``work_type`` (full_time / part_time /
      either). This is the commitment the engine's work-mode score reads
      (``calculate_work_mode_score``). The API exposes it as ``work_mode``
      for consistency with the Section 5.3.3 spec.
    - ``internship_type`` → remote / onsite / hybrid / any. A hard filter
      in ``passes_hard_filters``.
    - ``country``/``city``→ used by the location score and embedded into
      the student's semantic profile text.
    - ``availability_start`` / ``availability_end`` → the availability
      window a student can commit to.

    Basic invariant: ``availability_end`` before ``availability_start`` is
    rejected with 400.
    """

    work_mode = serializers.ChoiceField(
        source="work_type",
        choices=StudentProfile.WORK_TYPE_CHOICES,
        required=False,
        help_text=(
            "Preferred commitment: full_time, part_time, either. "
            "Stored on StudentProfile.work_type."
        ),
    )
    internship_type = serializers.ChoiceField(
        choices=StudentProfile.INTERNSHIP_TYPE_CHOICES,
        required=False,
        help_text="Preferred work modality: remote, onsite, hybrid, any.",
    )
    availability_start = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Earliest date available for an internship (YYYY-MM-DD).",
    )
    availability_end = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Latest date available for an internship (YYYY-MM-DD).",
    )
    availability_immediately = serializers.BooleanField(
        required=False,
        default=False,
        help_text="True if the student is available for an internship immediately.",
    )

    class Meta:
        model = StudentProfile
        fields = [
            "country",
            "city",
            "work_mode",
            "internship_type",
            "availability_start",
            "availability_end",
            "availability_immediately",
        ]

    def validate(self, attrs):
        start = attrs.get("availability_start")
        end = attrs.get("availability_end")
        immediately = attrs.get("availability_immediately")

        # If 'immediately' is true, dates are optional/ignored
        if immediately:
            return attrs

        if start is not None and end is not None and end < start:
            raise serializers.ValidationError({
                "availability_end": (
                    "availability_end cannot be before availability_start."
                )
            })
        return attrs


# =====================================================================
# Phase 3 Task 3.2 — Skills & Career Interests endpoints
# =====================================================================
class StudentSkillSerializer(serializers.ModelSerializer):
    """
    Output serializer for a Skill attached to a student profile. Students
    add skills by catalogue ID only (never free-text), so Phase 6 matching
    relies on canonical Skill rows.
    """

    class Meta:
        model = Skill
        fields = ["id", "name", "category", "description", "is_active"]


class StudentInterestSerializer(serializers.ModelSerializer):
    """
    Output serializer for a CareerInterest attached to a student profile.
    Interests are catalogue-constrained (never free-text).
    """

    class Meta:
        model = CareerInterest
        fields = ["id", "name", "description", "is_active"]


class StudentSkillInputSerializer(serializers.Serializer):
    """POST /api/students/me/skills/ — add a skill by catalogue ID."""

    skill_id = serializers.IntegerField(
        help_text=(
            "ID of an existing Skill from the catalogue (Task 1.3). "
            "Unknown IDs are rejected with 400 — no free-text skills."
        ),
    )

    def validate_skill_id(self, value):
        if not Skill.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError(
                "Skill not found in the catalogue (Task 1.3). "
                "Skills must be selected from the catalogue, not free-typed."
            )
        return value


class StudentInterestInputSerializer(serializers.Serializer):
    """POST /api/students/me/interests/ — add an interest by catalogue ID."""

    interest_id = serializers.IntegerField(
        help_text=(
            "ID of an existing CareerInterest from the catalogue (Task 1.3). "
            "Unknown IDs are rejected with 400 — no free-text interests."
        ),
    )

    def validate_interest_id(self, value):
        if not CareerInterest.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError(
                "Career interest not found in the catalogue (Task 1.3). "
                "Interests must be selected from the catalogue, not free-typed."
            )
        return value
