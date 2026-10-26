from django.test import TestCase
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.common.models import TimeStampedModel
from apps.internships.models import Internship
from .models import Recommendation

User = get_user_model()


class RecommendationModelTest(TestCase):
    """Test cases for Recommendation model (Section 3.6 / Task 1.6)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="student_rec@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        self.internship = Internship.objects.create(
            title="AI Engineer Intern",
            organization_name="Open Research",
            description="LLM and Agent Research",
            application_url="https://example.com/apply",
            internship_type="hybrid",
            status=Internship.STATUS_ACTIVE,
        )

    def test_create_recommendation_with_scores(self):
        """Test creating a recommendation with full score breakdown and explanation."""
        rec = Recommendation.objects.create(
            student=self.user,
            internship=self.internship,
            overall_score=92.50,
            skill_score=95.00,
            education_score=90.00,
            interest_score=94.00,
            experience_score=88.00,
            location_score=90.00,
            work_mode_score=95.00,
            explanation={"reasons": ["High skill overlap", "Preferred work mode matches"]},
        )
        self.assertEqual(rec.student, self.user)
        self.assertEqual(rec.internship, self.internship)
        self.assertEqual(float(rec.overall_score), 92.50)
        self.assertEqual(float(rec.skill_score), 95.00)
        self.assertEqual(float(rec.education_score), 90.00)
        self.assertEqual(float(rec.interest_score), 94.00)
        self.assertEqual(float(rec.experience_score), 88.00)
        self.assertEqual(float(rec.location_score), 90.00)
        self.assertEqual(float(rec.work_mode_score), 95.00)
        self.assertEqual(len(rec.explanation["reasons"]), 2)
        self.assertIsNotNone(rec.recommendation_date)
        self.assertIsNotNone(rec.created_at)
        self.assertIsNotNone(rec.updated_at)
        self.assertTrue(issubclass(Recommendation, TimeStampedModel))

    def test_unique_together_student_internship(self):
        """Test unique constraint on (student, internship)."""
        Recommendation.objects.create(
            student=self.user,
            internship=self.internship,
            overall_score=75.00,
        )
        with self.assertRaises(IntegrityError):
            Recommendation.objects.create(
                student=self.user,
                internship=self.internship,
                overall_score=80.00,
            )

    def test_upsert_recommendation_latest_wins(self):
        """Test the 'latest wins' upsert_recommendation helper."""
        rec1, created1 = Recommendation.upsert_recommendation(
            student=self.user,
            internship=self.internship,
            overall_score=70.00,
            skill_score=65.00,
        )
        self.assertTrue(created1)
        self.assertEqual(float(rec1.overall_score), 70.00)

        # Upsert with higher score / newer matching
        rec2, created2 = Recommendation.upsert_recommendation(
            student=self.user,
            internship=self.internship,
            overall_score=95.00,
            skill_score=98.00,
            explanation={"reasons": ["Updated profile matches new skills"]},
        )
        self.assertFalse(created2)
        self.assertEqual(rec1.id, rec2.id)
        self.assertEqual(float(rec2.overall_score), 95.00)
        self.assertEqual(float(rec2.skill_score), 98.00)
        self.assertEqual(Recommendation.objects.filter(student=self.user).count(), 1)

    def test_feedback_transitions(self):
        """Test mark_viewed, mark_saved, mark_applied, mark_ignored."""
        rec = Recommendation.objects.create(
            student=self.user,
            internship=self.internship,
            overall_score=80.00,
        )
        self.assertEqual(rec.status, Recommendation.STATUS_RECOMMENDED)

        rec.mark_viewed()
        self.assertEqual(rec.status, Recommendation.STATUS_VIEWED)
        self.assertIsNotNone(rec.viewed_at)

        rec.mark_saved()
        self.assertEqual(rec.status, Recommendation.STATUS_SAVED)
        self.assertIsNotNone(rec.saved_at)

        rec.mark_applied()
        self.assertEqual(rec.status, Recommendation.STATUS_APPLIED)
        self.assertIsNotNone(rec.applied_at)

        rec.mark_ignored()
        self.assertEqual(rec.status, Recommendation.STATUS_IGNORED)
        self.assertIsNotNone(rec.ignored_at)
