"""
Migration 0001 for the recommendations app.

The Recommendation model was previously part of the internships app
(table: internships_recommendation). This migration:

  1. Renames the existing table to recommendations_recommendation
     so all existing data is preserved.
  2. Renames the old indexes that carried the 'internships_' prefix
     to the Django-generated names Django would expect for this app.
  3. Registers the model state under apps.recommendations so Django's
     ORM knows the table belongs here going forward.
  4. Marks internships migrations 0012 and 0013 as dependencies so
     Django knows this must run after them.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("internships", "0013_recommendation_preference_score_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ------------------------------------------------------------------
        # Step 1: Rename the physical table
        # ------------------------------------------------------------------
        migrations.RunSQL(
            sql="ALTER TABLE internships_recommendation RENAME TO recommendations_recommendation;",
            reverse_sql="ALTER TABLE recommendations_recommendation RENAME TO internships_recommendation;",
        ),

        # ------------------------------------------------------------------
        # Step 2: Rename old indexes to match what Django expects for the
        #         new app_label.  Old names carried 'internships_' prefix.
        # ------------------------------------------------------------------
        migrations.RunSQL(
            sql="""
                ALTER INDEX IF EXISTS internships_student_86ed13_idx
                    RENAME TO recommendations_student_status_idx;
                ALTER INDEX IF EXISTS internships_interns_3aa9db_idx
                    RENAME TO recommendations_internship_status_idx;
                ALTER INDEX IF EXISTS internships_overall_c045b9_idx
                    RENAME TO recommendations_overall_score_idx;
                ALTER INDEX IF EXISTS internships_recomme_8b3d01_idx
                    RENAME TO recommendations_date_idx;
                ALTER INDEX IF EXISTS internships_recommendation_pkey
                    RENAME TO recommendations_recommendation_pkey;
                ALTER INDEX IF EXISTS internships_recommendation_internship_id_a3a8d17b
                    RENAME TO recommendations_recommendation_internship_id_idx;
                ALTER INDEX IF EXISTS internships_recommendation_student_id_1d03361f
                    RENAME TO recommendations_recommendation_student_id_idx;
            """,
            reverse_sql="""
                ALTER INDEX IF EXISTS recommendations_student_status_idx
                    RENAME TO internships_student_86ed13_idx;
                ALTER INDEX IF EXISTS recommendations_internship_status_idx
                    RENAME TO internships_interns_3aa9db_idx;
                ALTER INDEX IF EXISTS recommendations_overall_score_idx
                    RENAME TO internships_overall_c045b9_idx;
                ALTER INDEX IF EXISTS recommendations_date_idx
                    RENAME TO internships_recomme_8b3d01_idx;
                ALTER INDEX IF EXISTS recommendations_recommendation_pkey
                    RENAME TO internships_recommendation_pkey;
                ALTER INDEX IF EXISTS recommendations_recommendation_internship_id_idx
                    RENAME TO internships_recommendation_internship_id_a3a8d17b;
                ALTER INDEX IF EXISTS recommendations_recommendation_student_id_idx
                    RENAME TO internships_recommendation_student_id_1d03361f;
            """,
        ),

        # ------------------------------------------------------------------
        # Step 3: Register the model in Django's state only (no DDL).
        #         SeparateDatabaseAndState tells Django the table already
        #         exists after the RunSQL steps above.
        # ------------------------------------------------------------------
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="Recommendation",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("overall_score", models.DecimalField(decimal_places=2, help_text="Final weighted score (0-100)", max_digits=5)),
                        ("semantic_score", models.DecimalField(blank=True, decimal_places=2, help_text="Semantic embedding score (0-100)", max_digits=5, null=True)),
                        ("skill_score", models.DecimalField(blank=True, decimal_places=2, help_text="Skill matching score (0-100)", max_digits=5, null=True)),
                        ("preference_score", models.DecimalField(blank=True, decimal_places=2, help_text="Preference match score (0-100)", max_digits=5, null=True)),
                        ("location_score", models.DecimalField(blank=True, decimal_places=2, help_text="Location match score (0-100)", max_digits=5, null=True)),
                        ("salary_score", models.DecimalField(blank=True, decimal_places=2, help_text="Salary match score (0-100)", max_digits=5, null=True)),
                        ("education_score", models.DecimalField(blank=True, decimal_places=2, help_text="Education relevance score (0-100)", max_digits=5, null=True)),
                        ("interest_score", models.DecimalField(blank=True, decimal_places=2, help_text="Interest/career preference score (0-100)", max_digits=5, null=True)),
                        ("experience_score", models.DecimalField(blank=True, decimal_places=2, help_text="Experience relevance score (0-100)", max_digits=5, null=True)),
                        ("status", models.CharField(choices=[("recommended", "Recommended"), ("viewed", "Viewed"), ("saved", "Saved"), ("applied", "Applied"), ("ignored", "Ignored")], default="recommended", max_length=20)),
                        ("recommendation_date", models.DateTimeField(auto_now_add=True, help_text="When this recommendation was generated")),
                        ("viewed_at", models.DateTimeField(blank=True, help_text="When the student viewed this recommendation", null=True)),
                        ("saved_at", models.DateTimeField(blank=True, help_text="When the student saved this internship", null=True)),
                        ("applied_at", models.DateTimeField(blank=True, help_text="When the student applied to this internship", null=True)),
                        ("ignored_at", models.DateTimeField(blank=True, help_text="When the student ignored this recommendation", null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("internship", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recommendations", to="internships.internship")),
                        ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recommendations", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={
                        "ordering": ["-recommendation_date"],
                        "indexes": [
                            models.Index(fields=["student", "status"], name="recommendations_student_status_idx"),
                            models.Index(fields=["internship", "status"], name="recommendations_internship_status_idx"),
                            models.Index(fields=["overall_score"], name="recommendations_overall_score_idx"),
                            models.Index(fields=["recommendation_date"], name="recommendations_date_idx"),
                        ],
                        "constraints": [
                            models.UniqueConstraint(fields=["student", "internship"], name="unique_student_internship_recommendation"),
                        ],
                    },
                ),
            ],
            database_operations=[],  # table already exists after RunSQL above
        ),
    ]
