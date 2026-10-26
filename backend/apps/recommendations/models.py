from django.conf import settings
from django.db import models
from apps.common.models import TimeStampedModel


class Recommendation(TimeStampedModel):
    """
    Stores a personalized internship recommendation for a student,
    including the full score breakdown and behavioral feedback tracking.
    """

    STATUS_RECOMMENDED = "recommended"
    STATUS_VIEWED = "viewed"
    STATUS_SAVED = "saved"
    STATUS_APPLIED = "applied"
    STATUS_IGNORED = "ignored"

    STATUS_CHOICES = [
        (STATUS_RECOMMENDED, "Recommended"),
        (STATUS_VIEWED, "Viewed"),
        (STATUS_SAVED, "Saved"),
        (STATUS_APPLIED, "Applied"),
        (STATUS_IGNORED, "Ignored"),
    ]

    # --------------------------------------------------
    # Relationships
    # --------------------------------------------------

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recommendations",
    )

    internship = models.ForeignKey(
        "internships.Internship",
        on_delete=models.CASCADE,
        related_name="recommendations",
    )

    # --------------------------------------------------
    # Score breakdown (0-100)
    # --------------------------------------------------

    overall_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Final weighted score (0-100)",
    )

    semantic_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Semantic embedding score (0-100)",
    )

    skill_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Skill matching score (0-100)",
    )

    preference_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Preference match score (0-100)",
    )

    location_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Location match score (0-100)",
    )

    salary_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Salary match score (0-100)",
    )

    education_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Education relevance score (0-100)",
    )

    interest_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Interest/career preference score (0-100)",
    )

    experience_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Experience relevance score (0-100)",
    )

    work_mode_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Work mode relevance score (0-100)",
    )

    explanation = models.JSONField(
        default=dict,
        blank=True,
        help_text="Match explanation dictionary or text (reasons, matched skills, highlights).",
    )

    # --------------------------------------------------
    # Feedback tracking
    # --------------------------------------------------

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_RECOMMENDED,
    )

    recommendation_date = models.DateTimeField(
        auto_now_add=True,
        help_text="When this recommendation was generated",
    )

    viewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student viewed this recommendation",
    )

    saved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student saved this internship",
    )

    applied_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student applied to this internship",
    )

    ignored_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student ignored this recommendation",
    )

    # --------------------------------------------------
    # Feedback methods
    # --------------------------------------------------

    def mark_viewed(self):
        from django.utils import timezone
        self.status = self.STATUS_VIEWED
        self.viewed_at = timezone.now()
        self.save(update_fields=["status", "viewed_at", "updated_at"])

    def mark_saved(self):
        from django.utils import timezone
        self.status = self.STATUS_SAVED
        self.saved_at = timezone.now()
        self.save(update_fields=["status", "saved_at", "updated_at"])

    def mark_applied(self):
        from django.utils import timezone
        self.status = self.STATUS_APPLIED
        self.applied_at = timezone.now()
        self.save(update_fields=["status", "applied_at", "updated_at"])

    def mark_ignored(self):
        from django.utils import timezone
        self.status = self.STATUS_IGNORED
        self.ignored_at = timezone.now()
        self.save(update_fields=["status", "ignored_at", "updated_at"])

    @classmethod
    def upsert_recommendation(cls, student, internship, **scores_and_data):
        """
        Implements the 'latest wins' pattern: updates score breakdown,
        explanation, and timestamps if a recommendation already exists for
        (student, internship), or creates a new one.
        """
        defaults = {**scores_and_data}
        obj, created = cls.objects.update_or_create(
            student=student,
            internship=internship,
            defaults=defaults,
        )
        return obj, created

    def __str__(self):
        return (
            f"{self.student} → {self.internship} "
            f"(score: {float(self.overall_score):.2f})"
        )

    class Meta:
        ordering = ["-recommendation_date"]
        verbose_name = "Recommendation"
        verbose_name_plural = "Recommendations"
        unique_together = [("student", "internship")]

        constraints = [
            models.UniqueConstraint(
                fields=["student", "internship"],
                name="unique_student_internship_recommendation",
            ),
        ]

        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["internship", "status"]),
            models.Index(fields=["overall_score"]),
            models.Index(fields=["recommendation_date"]),
        ]


# Re-export SavedInternship for clean domain imports
from apps.internships.models import SavedInternship  # noqa: E402

