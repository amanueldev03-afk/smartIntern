"""
Migration: 0002_timestampedmodel_refactor

Refactors Recommendation to inherit TimeStampedModel:
  — already had created_at/updated_at; adds db_index to created_at.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recommendations", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="recommendation",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
                db_index=True,
                help_text="Timestamp when this record was created.",
            ),
        ),
    ]
