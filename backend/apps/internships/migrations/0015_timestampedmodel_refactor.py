"""
Migration: 0015_timestampedmodel_refactor

Refactors internship models to inherit TimeStampedModel:

  Skill            — already had created_at/updated_at, no column changes,
                     just updates bases in migration state.
  InternshipSource — same as Skill.
  Internship       — same as Skill.
  SavedInternship  — had created_at only; adds updated_at column.
  InternshipApplication — had applied_at + updated_at; renames applied_at
                          to created_at (preserving data), updates bases.
"""

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("internships", "0014_remove_recommendation_model"),
    ]

    operations = [
        # ------------------------------------------------------------------
        # Skill — bases change only, columns unchanged
        # ------------------------------------------------------------------
        migrations.AlterModelOptions(
            name="skill",
            options={"ordering": ["name"]},
        ),

        # ------------------------------------------------------------------
        # InternshipSource — bases change only, columns unchanged
        # ------------------------------------------------------------------
        migrations.AlterModelOptions(
            name="internshipsource",
            options={"ordering": ["name"]},
        ),

        # ------------------------------------------------------------------
        # Internship — bases change only, columns unchanged
        # ------------------------------------------------------------------
        migrations.AlterModelOptions(
            name="internship",
            options={
                "ordering": ["-created_at"],
                "indexes": [],  # kept managed by existing index migrations
            },
        ),

        # ------------------------------------------------------------------
        # SavedInternship — add updated_at (new column)
        # ------------------------------------------------------------------
        migrations.AddField(
            model_name="savedinternship",
            name="updated_at",
            field=models.DateTimeField(
                auto_now=True,
                help_text="Timestamp when this record was last updated.",
            ),
        ),

        # ------------------------------------------------------------------
        # InternshipApplication — rename applied_at → created_at,
        # update ordering.
        # ------------------------------------------------------------------
        migrations.RenameField(
            model_name="internshipapplication",
            old_name="applied_at",
            new_name="created_at",
        ),
        migrations.AlterField(
            model_name="internshipapplication",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                default=django.utils.timezone.now,
                help_text="Timestamp when this record was created.",
            ),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name="internshipapplication",
            options={"ordering": ["-created_at"]},
        ),

        # ------------------------------------------------------------------
        # Add db_index=True to created_at on Skill, InternshipSource,
        # Internship (carried over from TimeStampedModel definition).
        # ------------------------------------------------------------------
        migrations.AlterField(
            model_name="skill",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
        migrations.AlterField(
            model_name="internshipsource",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
        migrations.AlterField(
            model_name="internship",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
        migrations.AlterField(
            model_name="savedinternship",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
    ]
