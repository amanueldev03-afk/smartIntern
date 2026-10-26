import logging
from django.db import models
from pgvector.django import HnswIndex, VectorField
from apps.common.models import TimeStampedModel

logger = logging.getLogger(__name__)


class InternshipPosting(TimeStampedModel):
    """
    University-Industry Linkage (UIL) Internship Posting Model.
    Supports multi-track institutional postings:
      - CAMPUS: In-house software house / university R&D lab
      - COMPANY: Corporate partner / enterprise employer placement
      - DIRECT: Bilateral university-industry placement pathway
    """

    class Track(models.TextChoices):
        CAMPUS = "CAMPUS", "Campus / In-House"
        COMPANY = "COMPANY", "Company / Industry"
        DIRECT = "DIRECT", "Direct Placement"

    track = models.CharField(
        max_length=20,
        choices=Track.choices,
        default=Track.COMPANY,
        db_index=True,
        verbose_name="Internship Track",
    )
    title = models.CharField(
        max_length=255,
        db_index=True,
        verbose_name="Posting Title",
    )
    description = models.TextField(
        verbose_name="Detailed Description",
    )
    required_skills = models.ManyToManyField(
        "internships.Skill",
        blank=True,
        related_name="postings",
        verbose_name="Prerequisite Skills",
        help_text="Direct query against the canonical Skill table; never duplicated as an array.",
    )
    owner_department = models.ForeignKey(
        "uil_profiles.UniversityDepartment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="postings",
        verbose_name="Academic Department",
    )
    owner_company = models.ForeignKey(
        "companies.CompanyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="postings",
        verbose_name="Corporate Employer Profile",
    )
    capacity = models.PositiveIntegerField(
        default=1,
        verbose_name="Target Capacity (Slots)",
    )
    occupied_slots = models.PositiveIntegerField(
        default=0,
        verbose_name="Currently Occupied Slots",
    )
    city = models.CharField(
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        verbose_name="Placement City",
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Internship Start Date",
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Internship End Date",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        verbose_name="Active Status",
    )
    embedding = VectorField(
        dimensions=384,
        null=True,
        blank=True,
        verbose_name="384-dim Dense Vector Embedding",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Internship Posting"
        verbose_name_plural = "Internship Postings"
        indexes = [
            HnswIndex(
                name="posting_emb_hnsw_idx",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self):
        return f"[{self.track}] {self.title} ({self.city or 'Unspecified Location'})"

    @property
    def is_full(self) -> bool:
        return self.occupied_slots >= self.capacity

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        update_fields = kwargs.get("update_fields")
        super().save(*args, **kwargs)

        # Trigger embedding recalculation task on save when appropriate
        if not update_fields or "embedding" not in update_fields:
            try:
                from apps.postings.tasks import recalculate_posting_embeddings_task
                recalculate_posting_embeddings_task.delay(self.pk)
            except Exception:
                # If Celery worker/broker is offline, compute inline if embedding is missing
                if not self.embedding:
                    try:
                        from apps.postings.tasks import recalculate_posting_embeddings_task
                        recalculate_posting_embeddings_task(self.pk)
                    except Exception as err:
                        logger.debug(f"Inline embedding calculation failed: {err}")
