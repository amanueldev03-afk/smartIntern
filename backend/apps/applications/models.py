from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


from django.utils import timezone


class ApplicationHistory(TimeStampedModel):
    """
    Record that a student clicked Apply and was sent to the employer
    site (Section 3.6, Task 1.6). The platform never hosts the application itself.
    """

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="application_histories",
    )

    internship = models.ForeignKey(
        "internships.Internship",
        on_delete=models.CASCADE,
        related_name="application_histories",
    )

    clicked_apply = models.BooleanField(
        default=True,
        help_text="True when the student was redirected to the employer apply URL.",
    )

    applied_date = models.DateTimeField(
        default=timezone.now,
        help_text="When the student clicked apply.",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Application history"
        verbose_name_plural = "Application history"
        unique_together = [("student", "internship")]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "internship"],
                name="unique_student_internship_application_history",
            ),
        ]

    @property
    def apply_clicked(self):
        return self.clicked_apply

    @apply_clicked.setter
    def apply_clicked(self, val):
        self.clicked_apply = val

    @property
    def applied_at(self):
        return self.applied_date

    def __str__(self):
        return f"{self.student} → {self.internship}"

