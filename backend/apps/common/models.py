"""
common/models.py — Shared abstract base models.

All domain models that need audit timestamps inherit TimeStampedModel
instead of defining created_at / updated_at individually.

Section 3.8.4 (class diagram) requires these to inherit TimeStampedModel:
  - Student
  - Skill
  - StudentSkill
  - CareerInterest
  - StudentInterest
  - Company
  - DataSource
  - Internship
  - InternshipSkill
  - Recommendation
  - ApplicationHistory

Existing models that also inherit it (same business need: audit trail):
  - InternshipSource, SavedInternship, InternshipApplication
  - StudentProfile, StudentCV, CV

NOT inheriting (intentional exceptions):
  - User — extends AbstractBaseUser + PermissionsMixin; created_at/updated_at
    are declared on User directly to avoid MRO conflicts.
  - InternshipCollectionLog — started_at/completed_at, not created/updated.
"""

from django.db import models


class TimeStampedModel(models.Model):
    """
    Abstract base model that provides self-managed ``created_at`` and
    ``updated_at`` fields to any model that inherits it.

    - ``created_at`` is set once on INSERT and never changes.
    - ``updated_at`` is refreshed on every UPDATE automatically.

    Usage::

        class MyModel(TimeStampedModel):
            name = models.CharField(max_length=100)
            # created_at and updated_at are inherited automatically
    """

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Timestamp when this record was created.",
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when this record was last updated.",
    )

    class Meta:
        abstract = True
        ordering = ["-created_at"]
