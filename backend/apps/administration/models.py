from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class StudentActivityLog(TimeStampedModel):
    """
    Lightweight activity log for student account actions.

    Tracks actions that help administrators understand relevant student
    account activity without introducing unnecessary complexity.
    """

    ACTION_CHOICES = [
        ("profile_update", "Profile Update"),
        ("resume_upload", "Resume Upload"),
        ("internship_save", "Internship Saved"),
        ("internship_apply", "Internship Applied"),
        ("recommendation_view", "Recommendation Viewed"),
        ("account_activated", "Account Activated"),
        ("account_deactivated", "Account Deactivated"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activity_logs",
    )

    action = models.CharField(
        max_length=30,
        choices=ACTION_CHOICES,
    )

    description = models.TextField(
        blank=True,
        default="",
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Student Activity Log"
        verbose_name_plural = "Student Activity Logs"

    def __str__(self):
        return (
            f"{self.student.email} - "
            f"{self.get_action_display()} - "
            f"{self.created_at}"
        )
