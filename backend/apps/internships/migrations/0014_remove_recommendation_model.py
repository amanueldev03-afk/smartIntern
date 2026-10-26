"""
Migration 0014 for internships app.

The Recommendation model has been moved to the recommendations app.
The physical table was renamed in recommendations/migrations/0001_initial.py.
This migration removes the model from internships' Django state only —
no DDL is executed because the table no longer exists under this name.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("internships", "0013_recommendation_preference_score_and_more"),
        # Must run AFTER the recommendations migration that renames the table
        ("recommendations", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name="Recommendation"),
            ],
            database_operations=[],  # table already gone (renamed) — nothing to drop
        ),
    ]
