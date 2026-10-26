import uuid
from django.db import models
from django.core.exceptions import ValidationError


class InHouseCohort(models.Model):
    """
    University In-House Software House Cohort (Track 1).
    The UIL Head Officer sets cohort capacity (K) and manages cohort enrollment.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    university_name = models.CharField(
        max_length=255,
        verbose_name="University Name",
        help_text="Name of the university hosting the in-house software house cohort.",
    )

    academic_year = models.CharField(
        max_length=50,
        verbose_name="Academic Year",
        help_text="Academic year for this cohort (e.g. '2023/2024' or '4').",
    )

    start_date = models.DateField(
        verbose_name="Start Date",
        help_text="Start date of the in-house internship cohort.",
    )

    end_date = models.DateField(
        verbose_name="End Date",
        help_text="End date of the in-house internship cohort.",
    )

    capacity_k = models.PositiveIntegerField(
        verbose_name="Cohort Capacity (K)",
        help_text="Maximum capacity K of accepted students set by UIL Head Officer.",
    )

    enrolled_count = models.PositiveIntegerField(
        default=0,
        verbose_name="Enrolled Count",
        help_text="Current number of students accepted and enrolled in this cohort.",
    )

    is_open = models.BooleanField(
        default=True,
        verbose_name="Is Open",
        help_text="Whether this cohort is actively accepting applications or open for team formation.",
    )

    students = models.ManyToManyField(
        "accounts.StudentProfile",
        related_name="inhouse_cohorts",
        blank=True,
        verbose_name="Accepted Students",
        help_text="Student profiles accepted into this in-house cohort.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "In-House Cohort"
        verbose_name_plural = "In-House Cohorts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.university_name} - {self.academic_year} (Capacity: {self.capacity_k})"

    def clean(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError("Cohort start_date cannot be after end_date.")
