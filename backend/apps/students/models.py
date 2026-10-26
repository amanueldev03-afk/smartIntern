from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from apps.internships.models import Skill
from apps.common.models import TimeStampedModel
from pgvector.django import HnswIndex, VectorField


class StudentProfile(TimeStampedModel):
    """
    Stores academic, personal, professional, and internship
    preferences for a student.
    """

    EDUCATION_LEVEL_CHOICES = [
        ("high_school", "High School"),
        ("diploma", "Diploma"),
        ("bachelor", "Bachelor"),
        ("master", "Master"),
        ("phd", "PhD"),
        ("other", "Other"),
    ]

    # Fixed choice lists (Section 5.3 / 3.11.1): the AI matching engine
    # (semantic_matching.build_student_text) consumes these fields directly,
    # so we restrict them to canonical codes to avoid free-text noise.
    FIELD_OF_STUDY_CHOICES = [
        ("computer_science", "Computer Science"),
        ("software_engineering", "Software Engineering"),
        ("data_science", "Data Science"),
        ("artificial_intelligence", "Artificial Intelligence"),
        ("information_technology", "Information Technology"),
        ("information_systems", "Information Systems"),
        ("computer_engineering", "Computer Engineering"),
        ("electrical_engineering", "Electrical Engineering"),
        ("mechanical_engineering", "Mechanical Engineering"),
        ("civil_engineering", "Civil Engineering"),
        ("mathematics", "Mathematics"),
        ("statistics", "Statistics"),
        ("physics", "Physics"),
        ("business_administration", "Business Administration"),
        ("economics", "Economics"),
        ("finance", "Finance"),
        ("accounting", "Accounting"),
        ("marketing", "Marketing"),
        ("management", "Management"),
        ("health_sciences", "Health Sciences"),
        ("biology", "Biology"),
        ("chemistry", "Chemistry"),
        ("law", "Law"),
        ("design", "Design"),
        ("communications", "Communications"),
        ("other", "Other"),
    ]

    CURRENT_YEAR_CHOICES = [
        ("first_year", "First Year"),
        ("second_year", "Second Year"),
        ("third_year", "Third Year"),
        ("fourth_year", "Fourth Year"),
        ("final_year", "Final Year"),
        ("graduate", "Graduate"),
        ("other", "Other"),
    ]

    INTERNSHIP_TYPE_CHOICES = [
        ("remote", "Remote"),
        ("onsite", "On-site"),
        ("hybrid", "Hybrid"),
        ("any", "Any"),
    ]

    COMPENSATION_CHOICES = [
        ("paid", "Paid"),
        ("unpaid", "Unpaid"),
        ("either", "Either"),
    ]

    WORK_TYPE_CHOICES = [
        ("full_time", "Full-time"),
        ("part_time", "Part-time"),
        ("either", "Either"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="legacy_student_profile",
    )

    # ==========================================================
    #  Embedding
    # ==========================================================

    embedding = VectorField(
        dimensions=384,
        null=True,
        blank=True,
    )

    # ==========================================================
    # PERSONAL INFORMATION
    # ==========================================================

    phone = models.CharField(
        max_length=20,
        blank=True,
    )

    country = models.CharField(
        max_length=100,
        blank=True,
    )

    city = models.CharField(
        max_length=100,
        blank=True,
    )

    date_of_birth = models.DateField(
        null=True,
        blank=True,
    )

    bio = models.TextField(
        blank=True,
    )

    # ==========================================================
    # EDUCATION
    # ==========================================================

    education_level = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES,
        blank=True,
    )

    current_year = models.CharField(
        max_length=20,
        choices=CURRENT_YEAR_CHOICES,
        blank=True,
        help_text="Current academic year or status (fixed choice list).",
    )

    field_of_study = models.CharField(
        max_length=150,
        blank=True,
        help_text=(
            "Field of study code. The API validates against "
            "FIELD_OF_STUDY_CHOICES so the AI engine only sees canonical values."
        ),
    )

    university = models.CharField(
        max_length=200,
        blank=True,
    )

    student_id_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        verbose_name="Student University ID Number",
        help_text="Official university student identification number (e.g. UGR/1234/14).",
    )

    gpa = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Cumulative GPA",
        help_text="Cumulative Grade Point Average (0.00 - 4.00).",
    )

    # ==========================================================
    # SKILLS & EXPERIENCE
    # ==========================================================

    skills = models.ManyToManyField(
        Skill,
        blank=True,
        related_name="student_profiles",
    )

    # Phase 3 Task 3.2 — interests are validated against the CareerInterest
    # catalogue (Task 1.3), never free-typed. This keeps Phase 6 skill/interest
    # matching on canonical values instead of fuzzy string noise.
    interests = models.ManyToManyField(
        "CareerInterest",
        blank=True,
        related_name="student_profiles",
    )

    experience = models.TextField(
        blank=True,
    )

    # ==========================================================
    # INTERNSHIP PREFERENCES
    # ==========================================================

    internship_type = models.CharField(
        max_length=20,
        choices=INTERNSHIP_TYPE_CHOICES,
        default="any",
    )

    work_type = models.CharField(
        max_length=20,
        choices=WORK_TYPE_CHOICES,
        default="either",
    )

    compensation_preference = models.CharField(
        max_length=20,
        choices=COMPENSATION_CHOICES,
        default="either",
    )

    # ==========================================================
    # COMPENSATION RANGE
    # ==========================================================

    minimum_compensation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    maximum_compensation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    compensation_currency = models.CharField(
        max_length=10,
        default="USD",
    )

    # ==========================================================
    # LOCATION PREFERENCES
    # ==========================================================

    preferred_locations = models.JSONField(
        default=list,
        blank=True,
    )

    willing_to_relocate = models.BooleanField(
        default=False,
    )

    # ==========================================================
    # CAREER PREFERENCES
    # ==========================================================

    preferred_industries = models.JSONField(
        default=list,
        blank=True,
    )

    preferred_roles = models.JSONField(
        default=list,
        blank=True,
    )

    # ==========================================================
    # INTERNSHIP DURATION / AVAILABILITY
    # ==========================================================

    internship_duration_min_weeks = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    internship_duration_max_weeks = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    # Phase 3 Task 3.3 — availability window for internship preferences.
    # `availability_start` was previously named `available_from`.
    availability_start = models.DateField(
        null=True,
        blank=True,
        help_text="Earliest date the student is available for an internship.",
    )

    availability_end = models.DateField(
        null=True,
        blank=True,
        help_text="Latest date the student is available for an internship.",
    )

    # Phase 7 — 'Immediately' availability shortcut. When true the student is
    # available immediately and the date window is optional.
    availability_immediately = models.BooleanField(
        default=False,
        help_text="True if the student is available for an internship immediately.",
    )

    # ==========================================================
    # CV / RESUME
    # ==========================================================

    cv = models.FileField(
        upload_to="student_cvs/",
        null=True,
        blank=True,
    )

    # Phase 3 Task 3.4 — resume pointer (Section 5.3.6 / Figure 5.2).
    # Set exclusively via POST /api/students/me/resume/ (content-sniffed:
    # real PDF/DOCX only, never a disguised executable). The stored object is
    # the same file referenced by the latest ``CV`` record, which the resume
    # parsing pipeline (Task 3.5) consumes.
    resume = models.FileField(
        upload_to="student_resumes/",
        null=True,
        blank=True,
        help_text=(
            "Canonical resume file. Uploaded via POST /api/students/me/resume/; "
            "referenced by the latest CV record for async parsing."
        ),
    )

    # Phase 3 Task 3.5 — resume parsing flag (Section 5.3.6, Figure 5.2).
    # Set to True by the ``parse_resume`` Celery task once the latest resume
    # has been parsed successfully (async; see Task 3.5).
    resume_parsed = models.BooleanField(
        default=False,
        help_text=(
            "True once the resume has been parsed by the async parse_resume "
            "Celery task."
        ),
    )

    resume_parsed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the resume was last parsed by the async parse_resume task.",
    )

    # ==========================================================
    # VALIDATION
    # ==========================================================

    def clean(self):
        errors = {}

        # Paid internship compensation validation
        if self.compensation_preference == "paid":

            if self.minimum_compensation is None:
                errors["minimum_compensation"] = (
                    "Minimum compensation is required "
                    "when paid internships are selected."
                )

            if self.maximum_compensation is None:
                errors["maximum_compensation"] = (
                    "Maximum compensation is required "
                    "when paid internships are selected."
                )

            if (
                self.minimum_compensation is not None
                and self.maximum_compensation is not None
                and self.minimum_compensation
                > self.maximum_compensation
            ):
                errors["maximum_compensation"] = (
                    "Maximum compensation must be greater "
                    "than or equal to minimum compensation."
                )

        # Internship duration validation
        if (
            self.internship_duration_min_weeks is not None
            and self.internship_duration_max_weeks is not None
            and self.internship_duration_min_weeks
            > self.internship_duration_max_weeks
        ):
            errors["internship_duration_max_weeks"] = (
                "Maximum duration must be greater "
                "than or equal to minimum duration."
            )

        # Unique student ID per university invariant
        if self.student_id_number and self.university:
            try:
                from apps.uil_profiles.utils import universities_match
                existing = StudentProfile.objects.filter(
                    student_id_number__iexact=self.student_id_number.strip(),
                ).exclude(id=self.id)
                for ex in existing:
                    if universities_match(ex.university, self.university):
                        errors["student_id_number"] = (
                            f"A student with ID '{self.student_id_number.strip()}' already exists for {self.university.strip()}."
                        )
                        break
            except Exception:
                pass

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.user.email} - Student Profile"

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student Profile"
        verbose_name_plural = "Student Profiles"
        indexes = [
            HnswIndex(
                name="student_profile_emb_hnsw_idx",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]



class StudentCV(TimeStampedModel):

    student = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cv",
    )

    file = models.FileField(
        upload_to="student_cvs/",
    )

    extracted_text = models.TextField(
        blank=True,
        default="",
    )

    extracted_skills = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_education = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_experience = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_projects = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_certifications = models.JSONField(
        default=list,
        blank=True,
    )

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"CV - {self.student.email}"




class CV(TimeStampedModel):

    STATUS_PENDING = "PENDING"
    STATUS_PROCESSING = "PROCESSING"
    STATUS_COMPLETED = "COMPLETED"
    STATUS_FAILED = "FAILED"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cvs",
        null=True,
        blank=True,
    )

    file = models.FileField(
        upload_to="student_cvs/",
        null=True,
        blank=True,
    )

    extracted_text = models.TextField(
        blank=True,
        default="",
    )

    extracted_skills = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_education = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_experience = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_projects = models.JSONField(
        default=list,
        blank=True,
    )

    extracted_certifications = models.JSONField(
        default=list,
        blank=True,
    )

    # Phase 7 — Languages are extracted as a separate section from
    # certifications. Each entry is ``{"name": str, "proficiency": str|None}``.
    extracted_languages = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Spoken languages extracted from the CV as a list of "
            "{name, proficiency} objects. Populated by the CV analysis pipeline."
        ),
    )

    # Phase 6 Task 6.1 — Total years of professional experience calculated from
    # parsed experience entries (e.g., "3 years" + "2 years" = 5.0 years)
    extracted_experience_years = models.FloatField(
        default=0.0,
        blank=True,
    )

    processing_status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )

    processing_error = models.TextField(
        blank=True,
        null=True,
    )

    processed_at = models.DateTimeField(
        blank=True,
        null=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"CV - {self.student.email}"


class Student(TimeStampedModel):
    """
    Student profile entity (Table 3.3, Section 3.8.4).
    Composition relationship with User (deleting User cascades to Student).
    """

    EDUCATION_LEVEL_CHOICES = [
        ("high_school", "High School"),
        ("diploma", "Diploma"),
        ("bachelor", "Bachelor"),
        ("master", "Master"),
        ("phd", "PhD"),
        ("other", "Other"),
    ]

    WORK_MODE_CHOICES = [
        ("remote", "Remote"),
        ("onsite", "On-site"),
        ("hybrid", "Hybrid"),
        ("any", "Any"),
    ]

    INTERNSHIP_TYPE_CHOICES = [
        ("full_time", "Full-time"),
        ("part_time", "Part-time"),
        ("either", "Either"),
    ]

    EXPERIENCE_LEVEL_CHOICES = [
        ("beginner", "Beginner"),
        ("intermediate", "Intermediate"),
        ("advanced", "Advanced"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student",
        help_text="User account associated with this student profile (composition: deleting User deletes Student).",
    )

    education_level = models.CharField(
        max_length=50,
        choices=EDUCATION_LEVEL_CHOICES,
        blank=True,
    )

    field_of_study = models.CharField(
        max_length=150,
        blank=True,
    )

    university = models.CharField(
        max_length=200,
        blank=True,
    )

    current_year = models.CharField(
        max_length=50,
        blank=True,
        help_text="Current academic year or status (e.g. 1st Year, 2nd Year, 3rd Year, Final Year).",
    )

    experience_level = models.CharField(
        max_length=50,
        choices=EXPERIENCE_LEVEL_CHOICES,
        blank=True,
    )

    preferred_country = models.CharField(
        max_length=100,
        blank=True,
    )

    preferred_city = models.CharField(
        max_length=100,
        blank=True,
    )

    work_mode = models.CharField(
        max_length=20,
        choices=WORK_MODE_CHOICES,
        default="any",
        blank=True,
    )

    internship_type = models.CharField(
        max_length=20,
        choices=INTERNSHIP_TYPE_CHOICES,
        default="either",
        blank=True,
    )

    availability_start = models.DateField(
        null=True,
        blank=True,
    )

    availability_end = models.DateField(
        null=True,
        blank=True,
    )

    resume = models.FileField(
        upload_to="student_resumes/",
        null=True,
        blank=True,
    )

    skills = models.ManyToManyField(
        Skill,
        through="StudentSkill",
        related_name="students",
        blank=True,
    )

    interests = models.ManyToManyField(
        "CareerInterest",
        through="StudentInterest",
        related_name="students",
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student"
        verbose_name_plural = "Students"

    def __str__(self):
        return f"{self.user.email} - Student"


class CareerInterest(TimeStampedModel):
    """
    Catalogue of career interests and domains (Task 1.3).
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
    )

    description = models.TextField(
        blank=True,
    )

    is_active = models.BooleanField(
        default=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Career Interest"
        verbose_name_plural = "Career Interests"

    def __str__(self):
        return self.name


class StudentSkill(TimeStampedModel):
    """
    Through table linking Student and Skill with proficiency level (Task 1.3).
    Enforces uniqueness on (student, skill) to prevent duplicate score inflation.

    Phase 6 Task 6.1 — Added source field to track whether a skill was added
    manually by the student or extracted from their resume via the resume parser.
    """
    class Proficiency(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        RESUME = "resume", "Resume"

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="student_skills",
    )

    skill = models.ForeignKey(
        Skill,
        on_delete=models.CASCADE,
        related_name="student_skills",
    )

    proficiency = models.CharField(
        max_length=20,
        choices=Proficiency.choices,
        default=Proficiency.BEGINNER,
    )

    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        help_text="Source of this skill: manually added by student or extracted from resume.",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student Skill"
        verbose_name_plural = "Student Skills"
        unique_together = [("student", "skill")]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "skill"],
                name="unique_student_skill",
            ),
        ]

    def __str__(self):
        return f"{self.student.user.email} - {self.skill.name} ({self.get_proficiency_display()}, {self.get_source_display()})"


class StudentInterest(TimeStampedModel):
    """
    Through table linking Student and CareerInterest (Task 1.3).
    Enforces uniqueness on (student, interest).
    """

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="student_interests",
    )

    interest = models.ForeignKey(
        CareerInterest,
        on_delete=models.CASCADE,
        related_name="student_interests",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student Interest"
        verbose_name_plural = "Student Interests"
        unique_together = [("student", "interest")]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "interest"],
                name="unique_student_interest",
            ),
        ]

    def __str__(self):
        return f"{self.student.user.email} - {self.interest.name}"


class Resume(TimeStampedModel):
    """
    Uploaded student resume document and asynchronous extraction pipeline state.
    """

    class ParsingStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    student = models.ForeignKey(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="resumes",
    )
    file = models.FileField(
        upload_to="resumes/%Y/%m/",
    )
    extracted_text = models.TextField(
        blank=True,
        default="",
    )
    parsing_status = models.CharField(
        max_length=20,
        choices=ParsingStatus.choices,
        default=ParsingStatus.PENDING,
    )
    parsed_data = models.JSONField(
        default=dict,
        blank=True,
    )
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = "Resume"
        verbose_name_plural = "Resumes"

    def __str__(self):
        return f"Resume {self.id} ({self.student.user.email}) - {self.parsing_status}"