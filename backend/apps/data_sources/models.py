from django.db import models

from apps.common.models import TimeStampedModel


class DataSource(TimeStampedModel):
    """
    Authorised origin of internship listings (Section 3.6, Task 1.4).

    The supply loop pulls from three kinds of sources:
    public internship APIs, RSS feeds, and company career websites.
    """

    class Type(models.TextChoices):
        API = "api", "API"
        RSS = "rss", "RSS Feed"
        CAREER_SITE = "career_site", "Career Site"

    name = models.CharField(
        max_length=200,
        unique=True,
        db_index=True,
    )

    type = models.CharField(
        max_length=30,
        choices=Type.choices,
        default=Type.API,
    )

    base_url = models.URLField(
        blank=True,
    )

    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Configuration dictionary for API keys, endpoints, and scraping parameters.",
    )

    description = models.TextField(
        blank=True,
    )

    is_active = models.BooleanField(
        default=True,
    )

    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Data source"
        verbose_name_plural = "Data sources"

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
