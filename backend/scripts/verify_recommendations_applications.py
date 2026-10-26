"""
Verification script for Task 1.6:
1. Recommendation model with score breakdown, explanation, recommendation_date.
2. "Latest wins" upsert pattern on (student, internship).
3. SavedInternship with (student, internship, unique_together).
4. ApplicationHistory with (student, internship, clicked_apply, applied_date, unique_together).
"""
import os
import sys
import django
import time

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from apps.common.models import TimeStampedModel
from apps.internships.models import Internship, SavedInternship
from apps.recommendations.models import Recommendation
from apps.applications.models import ApplicationHistory

User = get_user_model()


def run_checks():
    print("=" * 60)
    print("TASK 1.6 VERIFICATION: Recommendation, SavedInternship, ApplicationHistory")
    print("=" * 60)

    passed = 0
    total = 0

    def check(desc, condition):
        nonlocal passed, total
        total += 1
        if condition:
            print(f"  [PASS] {desc}")
            passed += 1
        else:
            print(f"  [FAIL] {desc}")
            raise AssertionError(f"Check failed: {desc}")

    student_email = "student_rec_test@example.com"
    User.objects.filter(email=student_email).delete()
    Internship.objects.filter(title="Task 1.6 Target Internship").delete()

    try:
        # Check 1: Model inheritance
        check("Recommendation inherits TimeStampedModel", issubclass(Recommendation, TimeStampedModel))
        check("SavedInternship inherits TimeStampedModel", issubclass(SavedInternship, TimeStampedModel))
        check("ApplicationHistory inherits TimeStampedModel", issubclass(ApplicationHistory, TimeStampedModel))

        # Check 2: Setup test User and Internship
        student_user = User.objects.create_user(
            email=student_email,
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        internship = Internship.objects.create(
            title="Task 1.6 Target Internship",
            organization_name="AI Research Lab",
            description="Machine Learning Engineer Intern position.",
            application_url="https://example.com/apply",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )

        # Check 3: Create Recommendation with all Table 3.x / Section 3.8.4 fields
        explanation_data = {
            "reasons": ["Strong Python/Django match", "Master degree matches requirement"],
            "matched_skills": ["Python", "Django", "PostgreSQL"],
            "missing_skills": ["Kubernetes"],
        }
        rec = Recommendation.objects.create(
            student=student_user,
            internship=internship,
            overall_score=88.50,
            skill_score=90.00,
            education_score=85.00,
            interest_score=95.00,
            experience_score=80.00,
            location_score=100.00,
            work_mode_score=90.00,
            explanation=explanation_data,
        )
        check("Recommendation created successfully", rec.id is not None)
        check("overall_score is 88.50", float(rec.overall_score) == 88.50)
        check("skill_score is 90.00", float(rec.skill_score) == 90.00)
        check("education_score is 85.00", float(rec.education_score) == 85.00)
        check("interest_score is 95.00", float(rec.interest_score) == 95.00)
        check("experience_score is 80.00", float(rec.experience_score) == 80.00)
        check("location_score is 100.00", float(rec.location_score) == 100.00)
        check("work_mode_score is 90.00", float(rec.work_mode_score) == 90.00)
        check("explanation is dictionary", rec.explanation.get("matched_skills") == ["Python", "Django", "PostgreSQL"])
        check("recommendation_date is populated", rec.recommendation_date is not None)
        check("created_at and updated_at are populated", rec.created_at is not None and rec.updated_at is not None)

        # Check 4: Duplicate Recommendation on same student+internship raises IntegrityError
        try:
            with transaction.atomic():
                Recommendation.objects.create(
                    student=student_user,
                    internship=internship,
                    overall_score=50.00,
                )
            dup_rec_failed = False
        except IntegrityError:
            dup_rec_failed = True
        check("Duplicate Recommendation raises IntegrityError", dup_rec_failed)

        # Check 5: "Latest wins" pattern via upsert_recommendation / update_or_create
        initial_updated_at = rec.updated_at
        time.sleep(0.01)

        updated_rec, created = Recommendation.upsert_recommendation(
            student=student_user,
            internship=internship,
            overall_score=94.25,
            skill_score=98.00,
            explanation={"reasons": ["Updated match after student added PyTorch skill"]},
        )
        check("Upsert did not create duplicate (created is False)", created is False)
        check("Upsert updated same instance ID", updated_rec.id == rec.id)
        check("Upsert updated overall_score to 94.25", float(updated_rec.overall_score) == 94.25)
        check("Total recommendations for student is still 1", Recommendation.objects.filter(student=student_user).count() == 1)

        # Check 6: SavedInternship
        saved = SavedInternship.objects.create(
            student=student_user,
            internship=internship,
        )
        check("SavedInternship created successfully", saved.id is not None)
        check("SavedInternship student FK works", saved.student == student_user)
        check("SavedInternship internship FK works", saved.internship == internship)
        check("SavedInternship timestamps populated", saved.created_at is not None)

        try:
            with transaction.atomic():
                SavedInternship.objects.create(
                    student=student_user,
                    internship=internship,
                )
            dup_saved_failed = False
        except IntegrityError:
            dup_saved_failed = True
        check("Duplicate SavedInternship raises IntegrityError", dup_saved_failed)

        # Check 7: ApplicationHistory
        app_hist = ApplicationHistory.objects.create(
            student=student_user,
            internship=internship,
            clicked_apply=True,
            applied_date=timezone.now(),
        )
        check("ApplicationHistory created successfully", app_hist.id is not None)
        check("ApplicationHistory clicked_apply is True", app_hist.clicked_apply is True)
        check("ApplicationHistory apply_clicked property is True", app_hist.apply_clicked is True)
        check("ApplicationHistory applied_date is populated", app_hist.applied_date is not None)
        check("ApplicationHistory timestamps populated", app_hist.created_at is not None)

        try:
            with transaction.atomic():
                ApplicationHistory.objects.create(
                    student=student_user,
                    internship=internship,
                )
            dup_app_hist_failed = False
        except IntegrityError:
            dup_app_hist_failed = True
        check("Duplicate ApplicationHistory raises IntegrityError", dup_app_hist_failed)

    finally:
        # Cleanup
        User.objects.filter(email=student_email).delete()
        Internship.objects.filter(title="Task 1.6 Target Internship").delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
