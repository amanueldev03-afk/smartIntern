from django.test import TestCase
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from apps.common.models import TimeStampedModel
from apps.internships.models import Internship
from apps.recommendations.models import Recommendation
from apps.notifications.tasks import send_high_score_recommendation_notification
from .models import ApplicationHistory

User = get_user_model()


class ApplicationHistoryModelTest(TestCase):
    """Test cases for ApplicationHistory model (Section 3.6 / Task 1.6)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="applicant@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        self.internship = Internship.objects.create(
            title="Software Engineering Intern",
            organization_name="Tech Corp",
            description="Internship details",
            application_url="https://example.com/apply",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )

    def test_create_application_history(self):
        """Test creating an application history record."""
        app_hist = ApplicationHistory.objects.create(
            student=self.user,
            internship=self.internship,
            clicked_apply=True,
            applied_date=timezone.now(),
        )
        self.assertEqual(app_hist.student, self.user)
        self.assertEqual(app_hist.internship, self.internship)
        self.assertTrue(app_hist.clicked_apply)
        self.assertTrue(app_hist.apply_clicked)
        self.assertIsNotNone(app_hist.applied_date)
        self.assertIsNotNone(app_hist.created_at)
        self.assertIsNotNone(app_hist.updated_at)
        self.assertTrue(issubclass(ApplicationHistory, TimeStampedModel))

    def test_application_history_str_representation(self):
        """Test string representation of ApplicationHistory."""
        app_hist = ApplicationHistory.objects.create(
            student=self.user,
            internship=self.internship,
        )
        self.assertIn(self.user.email, str(app_hist))
        self.assertIn(self.internship.title, str(app_hist))

    def test_unique_together_student_internship(self):
        """Test unique constraint on (student, internship)."""
        ApplicationHistory.objects.create(
            student=self.user,
            internship=self.internship,
        )
        with self.assertRaises(IntegrityError):
            ApplicationHistory.objects.create(
                student=self.user,
                internship=self.internship,
            )

    def test_cascade_deletion(self):
        """Test that deleting student or internship cascades."""
        app_hist = ApplicationHistory.objects.create(
            student=self.user,
            internship=self.internship,
        )
        app_hist_id = app_hist.id
        self.user.delete()
        self.assertFalse(ApplicationHistory.objects.filter(
            id=app_hist_id).exists())


class TrackApplicationAPITest(TestCase):
    """Test cases for POST /api/applications/track/ endpoint (Task 8.2)."""

    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="student_track@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        self.other_student = User.objects.create_user(
            email="other_track@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="admin_track@example.com",
            password="TestPassword123!",
            role=User.Role.ADMIN,
            is_email_verified=True,
        )
        self.internship = Internship.objects.create(
            title="Software Engineering Intern",
            organization_name="Tech Corp",
            description="Internship details",
            application_url="https://example.com/apply/123",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )

    def test_track_application_authenticated_student(self):
        """Test POST /api/applications/track/ creates ApplicationHistory with clicked_apply=True"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )
        self.assertIn(response.status_code, [200, 201])
        self.assertTrue(response.data.get("clicked_apply"))

        # Verify DB record
        history = ApplicationHistory.objects.filter(
            student=self.student,
            internship=self.internship,
        ).first()
        self.assertIsNotNone(history)
        self.assertTrue(history.clicked_apply)
        self.assertIsNotNone(history.applied_date)

    def test_track_application_idempotency_and_update(self):
        """Test multiple track requests for same student/internship do not raise constraint error"""
        self.client.force_authenticate(user=self.student)
        # First track
        res1 = self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )
        self.assertEqual(res1.status_code, 201)

        # Second track (same student and internship)
        res2 = self.client.post(
            "/api/applications/track/",
            {"internship_id": self.internship.id},
            format="json",
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(
            ApplicationHistory.objects.filter(
                student=self.student,
                internship=self.internship,
            ).count(),
            1,
        )

    def test_track_application_user_isolation(self):
        """Test tracking is strictly isolated per authenticated user"""
        self.client.force_authenticate(user=self.student)
        self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )

        # Confirm other_student has no history record
        self.assertFalse(
            ApplicationHistory.objects.filter(
                student=self.other_student,
                internship=self.internship,
            ).exists()
        )

    def test_track_application_unauthenticated(self):
        """Test unauthenticated request returns 401"""
        response = self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_track_application_non_student_forbidden(self):
        """Test admin role cannot track student applications (returns 403)"""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_track_application_nonexistent_internship(self):
        """Test tracking nonexistent internship returns 404"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            "/api/applications/track/",
            {"internship": 999999},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class ApplicationHistoryAPITest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="history_student@example.com", password="TestPassword123!", role=User.Role.STUDENT
        )
        self.other_student = User.objects.create_user(
            email="history_other@example.com", password="TestPassword123!", role=User.Role.STUDENT
        )
        self.internship = Internship.objects.create(
            title="History Internship", organization_name="Tech Corp", description="Details",
            application_url="https://example.com/apply", internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )

    def test_history_is_paginated_ordered_and_isolated(self):
        older_internship = Internship.objects.create(
            title="Older Internship", organization_name="Older Corp", description="Details",
            application_url="https://example.com/older", internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )
        older = ApplicationHistory.objects.create(
            student=self.student, internship=older_internship)
        newest = ApplicationHistory.objects.create(
            student=self.student, internship=self.internship)
        ApplicationHistory.objects.create(
            student=self.other_student, internship=older_internship)
        ApplicationHistory.objects.filter(pk=older.pk).update(
            applied_date=timezone.now() - timezone.timedelta(days=1)
        )
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/applications/history/?page_size=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["id"], newest.id)
        self.assertTrue(response.data["results"][0]["clicked_apply"])
        self.assertIsNotNone(response.data["next"])

    def test_history_requires_authentication_and_empty_is_paginated(self):
        response = self.client.get("/api/applications/history/")
        self.assertEqual(response.status_code, 401)
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/applications/history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])


class StudentLifecycleIntegrationTest(TestCase):
    """Verify the Phase 8 save, apply, notify, and history lifecycle."""

    def setUp(self):
        from rest_framework.test import APIClient

        self.client = APIClient()
        self.student = User.objects.create_user(
            email="lifecycle_student@example.com",
            password="TestPassword123!",
            role=User.Role.STUDENT,
        )
        self.internship = Internship.objects.create(
            title="Lifecycle Internship",
            organization_name="Tech Corp",
            description="Build useful software",
            application_url="https://example.com/apply",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )
        self.client.force_authenticate(user=self.student)

    def test_save_apply_notify_and_review_history(self):
        save_response = self.client.post(
            f"/api/internships/{self.internship.id}/save/"
        )
        self.assertIn(save_response.status_code, (200, 201))
        self.assertTrue(save_response.data["saved"])

        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85,
        )
        notification_result = send_high_score_recommendation_notification.run(
            recommendation.id
        )
        self.assertEqual(notification_result["status"], "sent")
        self.assertEqual(mail.outbox[0].to, [self.student.email])

        apply_response = self.client.post(
            "/api/applications/track/",
            {"internship": self.internship.id},
            format="json",
        )
        self.assertEqual(apply_response.status_code, 201)
        self.assertTrue(apply_response.data["clicked_apply"])

        history_response = self.client.get("/api/applications/history/")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.data["count"], 1)
        self.assertEqual(
            history_response.data["results"][0]["internship"],
            self.internship.id,
        )
