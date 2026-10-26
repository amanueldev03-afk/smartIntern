"""
Migration: 0012_timestampedmodel_refactor

Refactors student_profiles models to inherit TimeStampedModel:

  StudentProfile — already had created_at/updated_at; adds db_index to
                   created_at, updates help_text.
  StudentCV      — had uploaded_at + updated_at; renames uploaded_at
                   → created_at (preserving data).
  CV             — already had created_at/updated_at; adds db_index.
"""

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student_profiles", "0011_alter_cv_options_cv_extracted_certifications_and_more"),
    ]

    operations = [
        # ------------------------------------------------------------------
        # StudentProfile — add db_index to created_at
        # ------------------------------------------------------------------
        migrations.AlterField(
            model_name="studentprofile",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),

        # ------------------------------------------------------------------
        # StudentCV — rename uploaded_at → created_at, add db_index
        # ------------------------------------------------------------------
        migrations.RenameField(
            model_name="studentcv",
            old_name="uploaded_at",
            new_name="created_at",
        ),
        migrations.AlterField(
            model_name="studentcv",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                default=django.utils.timezone.now,
                help_text="Timestamp when this record was created.",
            ),
            preserve_default=False,
        ),

        # ------------------------------------------------------------------
        # CV — add db_index to created_at
        # ------------------------------------------------------------------
        migrations.AlterField(
            model_name="cv",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
    ]
