from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.conf import settings
from pgvector.django import HnswIndex, VectorField
from apps.common.models import TimeStampedModel


class Skill(TimeStampedModel):
    """
    Reusable skill used by students and internships.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
    )

    category = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="Skill category (e.g. Programming Languages, Frameworks, Cloud, Soft Skills).",
    )

    description = models.TextField(
        blank=True,
    )

    is_active = models.BooleanField(
        default=True,
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class InternshipSource(TimeStampedModel):
    """
    Represents the authorized source from which internships are collected.
    """

    SOURCE_TYPE_CHOICES = [
        ("api", "API"),
        ("website", "Website"),
        ("organization", "Organization"),
        ("other", "Other"),
    ]

    name = models.CharField(
        max_length=200,
        unique=True,
    )

    source_type = models.CharField(
        max_length=20,
        choices=SOURCE_TYPE_CHOICES,
    )

    website_url = models.URLField(
        blank=True,
    )

    description = models.TextField(
        blank=True,
    )

    is_active = models.BooleanField(
        default=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class Internship(TimeStampedModel):
    """
    Represents a real internship opportunity.
    """

    # ==========================================================
    # CHOICES
    # ==========================================================

    INTERNSHIP_TYPE_CHOICES = [
        ("remote", "Remote"),
        ("onsite", "On-site"),
        ("hybrid", "Hybrid"),
    ]

    COMPENSATION_TYPE_CHOICES = [
        ("paid", "Paid"),
        ("unpaid", "Unpaid"),
        ("unknown", "Unknown"),
    ]

    WORK_TYPE_CHOICES = [
        ("full_time", "Full-time"),
        ("part_time", "Part-time"),
    ]

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_REJECTED = "rejected"
    STATUS_EXPIRED = "expired"
    STATUS_REMOVED = "removed"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_REMOVED, "Removed"),
    ]

    # ==========================================================
    # EMBEDDING STATUS
    # ==========================================================

    EMBEDDING_STATUS_PENDING = "PENDING"
    EMBEDDING_STATUS_PROCESSING = "PROCESSING"
    EMBEDDING_STATUS_COMPLETED = "COMPLETED"
    EMBEDDING_STATUS_FAILED = "FAILED"

    EMBEDDING_STATUS_CHOICES = [
        (EMBEDDING_STATUS_PENDING, "Pending"),
        (EMBEDDING_STATUS_PROCESSING, "Processing"),
        (EMBEDDING_STATUS_COMPLETED, "Completed"),
        (EMBEDDING_STATUS_FAILED, "Failed"),
    ]

    # ==========================================================
    # BASIC INFORMATION
    # ==========================================================

    title = models.CharField(
        max_length=300,
    )

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="internships",
        help_text="Company publishing this internship (Section 3.6).",
    )

    data_source = models.ForeignKey(
        "data_sources.DataSource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="internships",
        help_text="Origin data source, null for company-direct postings (Section 3.6).",
    )

    organization_name = models.CharField(
        max_length=300,
    )

    description = models.TextField()

    required_education = models.CharField(
        max_length=100,
        blank=True,
        help_text="Required education level (e.g. Bachelor, Master, PhD).",
    )

    required_experience = models.CharField(
        max_length=100,
        blank=True,
        help_text="Required experience level (e.g. Beginner, Intermediate, None).",
    )

    work_mode = models.CharField(
        max_length=20,
        choices=[
            ("remote", "Remote"),
            ("onsite", "On-site"),
            ("hybrid", "Hybrid"),
            ("any", "Any"),
        ],
        default="any",
        blank=True,
    )

    salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Stipend / salary amount if specified.",
    )

    deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Application closing deadline.",
    )

    posted_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date when internship was posted by employer/source.",
    )

    content_hash = models.CharField(
        max_length=64,
        blank=True,
        db_index=True,
        help_text="SHA-256 hash of title+company+description for duplicate detection (Task 5.x).",
    )

    last_seen_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Last time this listing was seen by a collection run (Task 5.7).",
    )

    category = models.CharField(
        max_length=150,
        blank=True,
    )

    # ==========================================================
    #   EMBEDDING
    # ==========================================================

    embedding = VectorField(
        dimensions=384,
        null=True,
        blank=True,
    )

    embedding_status = models.CharField(
        max_length=20,
        choices=EMBEDDING_STATUS_CHOICES,
        default=EMBEDDING_STATUS_PENDING,
    )

    embedding_error = models.TextField(
        blank=True,
        null=True,
    )

    # ==========================================================
    # LOCATION
    # ==========================================================

    country = models.CharField(
        max_length=100,
        blank=True,
    )

    city = models.CharField(
        max_length=100,
        blank=True,
    )

    location_text = models.CharField(
        max_length=300,
        blank=True,
    )

    internship_type = models.CharField(
        max_length=20,
        choices=INTERNSHIP_TYPE_CHOICES,
    )

    # ==========================================================
    # WORK TYPE
    # ==========================================================

    work_type = models.CharField(
        max_length=20,
        choices=WORK_TYPE_CHOICES,
    )

    # ==========================================================
    # COMPENSATION
    # ==========================================================

    compensation_type = models.CharField(
        max_length=20,
        choices=COMPENSATION_TYPE_CHOICES,
        default="unknown",
    )

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
        blank=True,
    )

    compensation_period = models.CharField(
        max_length=30,
        blank=True,
        help_text="Example: monthly, hourly, total",
    )

    # ==========================================================
    # SKILLS
    # ==========================================================

    required_skills = models.ManyToManyField(
        Skill,
        blank=True,
        related_name="internships",
    )

    preferred_skills = models.JSONField(
        default=list,
        blank=True,
    )

    # ==========================================================
    # INTERNSHIP DETAILS
    # ==========================================================

    duration_min_weeks = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    duration_max_weeks = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    # ==========================================================
    # APPLICATION
    # ==========================================================

    application_url = models.URLField()

    source = models.ForeignKey(
        InternshipSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="internships",
    )

    source_url = models.URLField(
        blank=True,
    )

    external_id = models.CharField(
        max_length=300,
        blank=True,
    )

    # ==========================================================
    # DATES
    # ==========================================================

    posted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    application_deadline = models.DateTimeField(
        null=True,
        blank=True,
    )

    # ==========================================================
    # VERIFICATION / STATUS
    # ==========================================================

    is_verified = models.BooleanField(
        default=False,
    )

    needs_review = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Flagged for admin review (broken links, low-confidence skills, etc.) instead of auto-published (Section 3.10.8, Task 5.9).",
    )

    validated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the listing URLs were last validated by the Task 5.9 collector task.",
    )

    url_validation = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-URL validation results (HEAD/GET status, error) from Task 5.9.",
    )

    skills_review = models.JSONField(
        default=list,
        blank=True,
        help_text="Low-confidence skill matches flagged for the Task 5.9 admin review.",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )

    verified_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_internships",
    )

    rejection_reason = models.TextField(
        blank=True,
    )

    is_published = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Requires admin publishing approval for company postings before visibility to students.",
    )

    published_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_internships",
    )

    def is_expired(self):
        """
        Return True when the application deadline has passed.
        """

        if self.application_deadline is None:
            return False

        return self.application_deadline <= timezone.now()


    def expire_if_needed(self):
        """
        Automatically mark the internship as expired
        when its deadline has passed.
        """

        if self.is_expired() and self.status == "active":
            self.status = "expired"

            self.save(
                update_fields=[
                    "status",
                    "updated_at",
                ]
            )

            return True

        return False

        
    # ==========================================================
    # VALIDATION
    # ==========================================================

    def clean(self):
        errors = {}

        # Paid internship compensation validation
        if self.compensation_type == "paid":

            if self.minimum_compensation is None:
                errors["minimum_compensation"] = (
                    "Minimum compensation is required "
                    "for paid internships."
                )

            if self.maximum_compensation is None:
                errors["maximum_compensation"] = (
                    "Maximum compensation is required "
                    "for paid internships."
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

        # Duration validation
        if (
            self.duration_min_weeks is not None
            and self.duration_max_weeks is not None
            and self.duration_min_weeks
            > self.duration_max_weeks
        ):
            errors["duration_max_weeks"] = (
                "Maximum duration must be greater "
                "than or equal to minimum duration."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.title} - {self.organization_name}"

    class Meta:
        ordering = ["-created_at"]

        indexes = [
            models.Index(
                fields=["status"],
            ),
            models.Index(
                fields=["country", "city"],
            ),
            models.Index(
                fields=["internship_type"],
            ),
            models.Index(
                fields=["compensation_type"],
            ),
            models.Index(
                fields=["application_deadline"],
            ),
            HnswIndex(
                name="internship_emb_hnsw_idx",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "source",
                    "external_id",
                ],
                name="unique_internship_source_external_id",
            ),
        ]




class InternshipCollectionLog(models.Model):
    """
    Records the result of an internship collection run.
    """

    STATUS_CHOICES = [
        ("running", "Running"),
        ("success", "Success"),
        ("partial", "Partial"),
        ("failed", "Failed"),
    ]

    source = models.ForeignKey(
        InternshipSource,
        on_delete=models.CASCADE,
        related_name="collection_logs",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="running",
    )

    started_at = models.DateTimeField(
        auto_now_add=True,
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    records_found = models.PositiveIntegerField(
        default=0,
    )

    records_created = models.PositiveIntegerField(
        default=0,
    )

    records_updated = models.PositiveIntegerField(
        default=0,
    )

    records_failed = models.PositiveIntegerField(
        default=0,
    )

    error_message = models.TextField(
        blank=True,
    )

    def __str__(self):
        return (
            f"{self.source.name} - "
            f"{self.status} - "
            f"{self.started_at}"
        )

    class Meta:
        ordering = ["-started_at"]




class InternshipDuplicateFlag(TimeStampedModel):
    """
    A near-duplicate listing flagged for admin review instead of being
    auto-merged or silently dropped (Section 3.10.6, Task 5.7).

    A candidate with no exact ``content_hash`` match but a title that
    fuzzy-matches (rapidfuzz token ratio) a stored row from the same
    company is recorded here; an admin reviews the queue and merges or
    dismisses each flag.
    """

    REVIEW_PENDING = "pending"
    REVIEW_RESOLVED = "resolved"

    REVIEW_STATUS_CHOICES = [
        (REVIEW_PENDING, "Pending"),
        (REVIEW_RESOLVED, "Resolved"),
    ]

    internship = models.ForeignKey(
        Internship,
        on_delete=models.CASCADE,
        related_name="duplicate_flags",
        help_text="Stored internship this candidate was matched against.",
    )

    title = models.CharField(
        max_length=300,
    )

    organization_name = models.CharField(
        max_length=300,
    )

    application_url = models.URLField()

    content_hash = models.CharField(
        max_length=64,
        blank=True,
        db_index=True,
    )

    similarity_score = models.FloatField(
        null=True,
        blank=True,
        help_text="rapidfuzz token ratio (0-100) between the two titles.",
    )

    review_status = models.CharField(
        max_length=20,
        choices=REVIEW_STATUS_CHOICES,
        default=REVIEW_PENDING,
        db_index=True,
    )

    last_seen_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this candidate listing was seen by the collector (Task 5.7).",
    )

    def __str__(self):
        return (
            f"{self.title} ~ {self.internship.title} "
            f"({self.similarity_score})"
        )

    class Meta:
        ordering = ["-created_at"]




class SavedInternship(TimeStampedModel):
    """
    An internship saved by a student.
    """

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_internships",
    )

    internship = models.ForeignKey(
        Internship,
        on_delete=models.CASCADE,
        related_name="saved_by_students",
    )

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "student",
                    "internship",
                ],
                name="unique_student_saved_internship",
            ),
        ]

    def __str__(self):
        return (
            f"{self.student.email} - "
            f"{self.internship.title}"
        )



class InternshipApplication(TimeStampedModel):
    """
    Tracks a student's application to an internship.

    The actual application is submitted on the
    official organization's website.

    Note: applied_at is kept as a domain-specific alias for created_at
    so existing API consumers are not broken. Both fields are set on save.
    """

    STATUS_APPLIED = "applied"
    STATUS_INTERVIEW = "interview"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_WITHDRAWN = "withdrawn"

    STATUS_CHOICES = [
        (STATUS_APPLIED, "Applied"),
        (STATUS_INTERVIEW, "Interview"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_WITHDRAWN, "Withdrawn"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="internship_applications",
    )

    internship = models.ForeignKey(
        Internship,
        on_delete=models.CASCADE,
        related_name="student_applications",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_APPLIED,
    )

    notes = models.TextField(
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "student",
                    "internship",
                ],
                name="unique_student_internship_application",
            ),
        ]

    def __str__(self):
        return (
            f"{self.student.email} - "
            f"{self.internship.title} - "
            f"{self.status}"
        )


class InternshipSkill(TimeStampedModel):
    """
    Through table linking Internship and Skill (Task 1.5).
    Enforces uniqueness on (internship, skill).
    """

    internship = models.ForeignKey(
        Internship,
        on_delete=models.CASCADE,
    )

    skill = models.ForeignKey(
        Skill,
        on_delete=models.CASCADE,
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Internship Skill"
        verbose_name_plural = "Internship Skills"
        unique_together = [("internship", "skill")]
        constraints = [
            models.UniqueConstraint(
                fields=["internship", "skill"],
                name="unique_internship_skill",
            ),
        ]

    def __str__(self):
        return f"{self.internship.title} - {self.skill.name}"