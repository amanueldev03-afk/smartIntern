from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient
from django.test import TestCase
from django.utils import timezone
from datetime import datetime

from apps.students.models import StudentProfile
from apps.internships.models import Internship, InternshipSkill, Skill
from apps.recommendations.models import Recommendation
from .models import StudentActivityLog

User = get_user_model()


def make_student(email, password="TestPass123!", **kwargs):
    """Create an active, email-verified student."""
    user = User.objects.create_user(email=email, password=password, **kwargs)
    user.is_active = kwargs.get("is_active", True)
    user.is_email_verified = kwargs.get("is_email_verified", True)
    user.role = User.Role.STUDENT
    user.save(update_fields=["is_active", "is_email_verified", "role"])
    return user


def make_admin(email):
    return User.objects.create_superuser(
        email=email,
        username=email.split("@")[0],
        password="AdminPass123!",
    )


def login(client, email, password):
    return client.post(
        "/api/auth/login/",
        {"email": email, "password": password},
        format="json",
    )


class AdminStudentListAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin@example.com")
        self.student_a = make_student(
            "student_a@example.com", first_name="Alice", last_name="A"
        )
        self.student_b = make_student("student_b@example.com")
        StudentProfile.objects.get_or_create(
            user=self.student_a,
            defaults={"university": "Test University"},
        )

    def authenticate_admin(self):
        self.client.force_authenticate(user=self.admin)

    def authenticate_student(self):
        self.client.force_authenticate(user=self.student_a)

    # Test 1 — Admin can list students
    def test_admin_can_list_students(self):
        self.authenticate_admin()
        response = self.client.get("/api/admin/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        emails = [s["email"] for s in response.data["results"]]
        self.assertIn("student_a@example.com", emails)
        self.assertIn("student_b@example.com", emails)

    # Test 2 — Student cannot list students
    def test_student_cannot_list_students(self):
        self.authenticate_student()
        response = self.client.get("/api/admin/students/")
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        ])

    # Test 3 — Unauthenticated user cannot access admin endpoint
    def test_unauthenticated_cannot_list_students(self):
        response = self.client.get("/api/admin/students/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_list_does_not_expose_passwords(self):
        self.authenticate_admin()
        response = self.client.get("/api/admin/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sample = response.data["results"][0]
        self.assertNotIn("password", sample)

    def test_admin_can_filter_by_active_status(self):
        self.student_b.is_active = False
        self.student_b.save(update_fields=["is_active"])
        self.authenticate_admin()
        response = self.client.get(
            "/api/admin/students/", {"is_active": "false"}
        )
        emails = [s["email"] for s in response.data["results"]]
        self.assertIn("student_b@example.com", emails)
        self.assertNotIn("student_a@example.com", emails)

    def test_list_excludes_admin_users(self):
        self.authenticate_admin()
        response = self.client.get("/api/admin/students/")
        emails = [s["email"] for s in response.data["results"]]
        self.assertNotIn("admin@example.com", emails)


class AdminRecommendationAnalyticsAPITest(TestCase):
    """Task 9.3 analytics over persisted Recommendation rows."""

    endpoint = "/api/admin/analytics/ai/"

    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("analytics-admin@example.com")
        self.student = make_student("analytics-student@example.com")
        self.client.force_authenticate(user=self.admin)

    def create_recommendation(self, score, day=1):
        internship = Internship.objects.create(
            title=f"Analytics Internship {score}-{day}",
            organization_name="Analytics Corp",
            description="Analytics test internship",
            application_url=f"https://example.com/apply/{score}-{day}",
            internship_type="remote",
            work_type="full_time",
        )
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=internship,
            overall_score=score,
        )
        recommendation_date = timezone.make_aware(
            datetime(2026, 9, day, 12, 0),
        )
        Recommendation.objects.filter(pk=recommendation.pk).update(
            recommendation_date=recommendation_date,
        )
        return recommendation

    def get_analytics(self):
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_admin_can_access_analytics_and_average_score(self):
        self.create_recommendation(50)
        self.create_recommendation(70)
        self.create_recommendation(90)

        data = self.get_analytics()

        self.assertEqual(data["average_match_score"], 70.0)

    def test_recommendations_are_grouped_per_day(self):
        for score in (50, 60, 70):
            self.create_recommendation(score, day=1)
        for score in (80, 90):
            self.create_recommendation(score, day=2)

        data = self.get_analytics()

        self.assertEqual(
            data["recommendations_per_day"],
            [
                {"date": "2026-09-01", "count": 3},
                {"date": "2026-09-02", "count": 2},
            ],
        )

    def test_score_distribution_classifies_boundaries_once(self):
        for score in (0, 20, 40, 60, 80, 100):
            self.create_recommendation(score)

        data = self.get_analytics()

        self.assertEqual(
            data["score_distribution"],
            [
                {"range": "0-19", "count": 1},
                {"range": "20-39", "count": 1},
                {"range": "40-59", "count": 1},
                {"range": "60-79", "count": 1},
                {"range": "80-100", "count": 2},
            ],
        )
        self.assertEqual(
            sum(item["count"] for item in data["score_distribution"]),
            Recommendation.objects.count(),
        )

    def test_empty_recommendation_table(self):
        data = self.get_analytics()

        self.assertIsNone(data["average_match_score"])
        self.assertEqual(data["recommendations_per_day"], [])
        self.assertEqual(
            [item["count"] for item in data["score_distribution"]],
            [0, 0, 0, 0, 0],
        )

    def test_student_cannot_access_analytics(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(self.endpoint)
        self.assertIn(response.status_code, (401, 403))

    def test_unauthenticated_user_cannot_access_analytics(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.endpoint)
        self.assertIn(response.status_code, (401, 403))


class AdminAnalyticsAPITest(TestCase):
    endpoint = "/api/admin/analytics/"

    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("aggregate-admin@example.com")
        self.student = make_student("aggregate-student@example.com")
        self.client.force_authenticate(user=self.admin)

    def test_returns_database_aggregates(self):
        python = Skill.objects.create(name="Python")
        django = Skill.objects.create(name="Django")
        for index in range(3):
            internship = Internship.objects.create(
                title=f"Aggregate Internship {index}",
                organization_name="Aggregate Corp",
                description="Aggregate test internship",
                application_url=f"https://example.com/aggregate/{index}",
                status=Internship.STATUS_ACTIVE,
            )
            InternshipSkill.objects.create(internship=internship, skill=python)
            if index < 1:
                InternshipSkill.objects.create(internship=internship, skill=django)

        recommendation_internship = Internship.objects.create(
            title="Recommendation Internship",
            organization_name="Aggregate Corp",
            description="Recommendation test internship",
            application_url="https://example.com/recommendation",
        )
        Recommendation.objects.create(
            student=self.student,
            internship=recommendation_internship,
            overall_score=80,
        )

        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["users"], {"total": 2, "students": 1, "admins": 1})
        self.assertEqual(response.data["internships"]["total"], 4)
        self.assertEqual(response.data["internships"]["active"], 3)
        self.assertEqual(response.data["recommendations"], {
            "total": 1,
            "average_match_score": 80.0,
        })
        self.assertEqual(response.data["most_requested_skills"], [
            {"skill": "Python", "count": 3},
            {"skill": "Django", "count": 1},
        ])

    def test_student_and_unauthenticated_users_are_denied(self):
        self.client.force_authenticate(user=self.student)
        self.assertIn(self.client.get(self.endpoint).status_code, (401, 403))
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.endpoint).status_code, (401, 403))


class AdminStudentActivateDeactivateAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin@example.com")
        self.student_a = make_student("student_a@example.com")
        self.authenticate_admin()

    def authenticate_admin(self):
        self.client.force_authenticate(user=self.admin)

    def test_admin_can_deactivate_student(self):
        response = self.client.post(
            f"/api/admin/students/{self.student_a.id}/deactivate/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student_a.refresh_from_db()
        self.assertFalse(self.student_a.is_active)

    def test_admin_can_reactivate_student(self):
        self.student_a.is_active = False
        self.student_a.save(update_fields=["is_active"])
        response = self.client.post(
            f"/api/admin/students/{self.student_a.id}/activate/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student_a.refresh_from_db()
        self.assertTrue(self.student_a.is_active)

    def test_admin_cannot_deactivate_non_student(self):
        response = self.client.post(
            f"/api/admin/students/{self.admin.id}/deactivate/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_activate_non_existent_student(self):
        response = self.client.post(
            "/api/admin/students/99999/activate/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_deactivating_inactive_student_returns_400(self):
        self.student_a.is_active = False
        self.student_a.save(update_fields=["is_active"])
        response = self.client.post(
            f"/api/admin/students/{self.student_a.id}/deactivate/"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_activating_active_student_returns_400(self):
        response = self.client.post(
            f"/api/admin/students/{self.student_a.id}/activate/"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivate_records_activity_log(self):
        self.client.post(
            f"/api/admin/students/{self.student_a.id}/deactivate/"
        )
        log = StudentActivityLog.objects.filter(
            student=self.student_a, action="account_deactivated"
        ).first()
        self.assertIsNotNone(log)
        self.assertIn("admin@example.com", log.description)

    def test_reactivate_records_activity_log(self):
        self.student_a.is_active = False
        self.student_a.save(update_fields=["is_active"])
        self.client.post(
            f"/api/admin/students/{self.student_a.id}/activate/"
        )
        log = StudentActivityLog.objects.filter(
            student=self.student_a, action="account_activated"
        ).first()
        self.assertIsNotNone(log)


class AdminAuthorizationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin@example.com")
        self.student_a = make_student("student_a@example.com")

    # Student cannot activate/deactivate another user
    def test_student_cannot_deactivate_user(self):
        self.client.force_authenticate(user=self.student_a)
        target = make_student("target@example.com")
        response = self.client.post(
            f"/api/admin/students/{target.id}/deactivate/"
        )
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        ])
        target.refresh_from_db()
        self.assertTrue(target.is_active)

    def test_student_cannot_activate_user(self):
        self.client.force_authenticate(user=self.student_a)
        target = make_student("target2@example.com", is_active=False)
        response = self.client.post(
            f"/api/admin/students/{target.id}/activate/"
        )
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        ])

    def test_student_cannot_view_activity(self):
        self.client.force_authenticate(user=self.student_a)
        response = self.client.get(
            f"/api/admin/students/{self.student_a.id}/activity/"
        )
        self.assertIn(response.status_code, [
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        ])

    def test_unauthenticated_cannot_deactivate(self):
        target = make_student("target3@example.com")
        response = self.client.post(
            f"/api/admin/students/{target.id}/deactivate/"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DeactivatedStudentLoginTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin@example.com")

    # Test 5 — Deactivated student cannot log in
    def test_deactivated_student_cannot_login(self):
        student = make_student("blocked@example.com")

        # Before deactivation, login succeeds
        ok = login(self.client, "blocked@example.com", "TestPass123!")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        # Admin deactivates
        self.client.force_authenticate(user=self.admin)
        deact = self.client.post(
            f"/api/admin/students/{student.id}/deactivate/"
        )
        self.assertEqual(deact.status_code, status.HTTP_200_OK)

        # Next login attempt rejected with 403 (Phase 2 inactive path)
        self.client.force_authenticate(user=None)
        self.client.credentials()
        rejected = login(self.client, "blocked@example.com", "TestPass123!")
        self.assertEqual(rejected.status_code, status.HTTP_403_FORBIDDEN)

    # Test 7 — Reactivated student can log in
    def test_reactivated_student_can_login(self):
        student = make_student("unblocked@example.com")
        student.is_active = False
        student.save(update_fields=["is_active"])

        # While inactive, login is blocked
        self.client.force_authenticate(user=None)
        self.client.credentials()
        blocked = login(self.client, "unblocked@example.com", "TestPass123!")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        # Admin reactivates
        self.client.force_authenticate(user=self.admin)
        act = self.client.post(
            f"/api/admin/students/{student.id}/activate/"
        )
        self.assertEqual(act.status_code, status.HTTP_200_OK)

        # Login now succeeds
        self.client.force_authenticate(user=None)
        self.client.credentials()
        success = login(self.client, "unblocked@example.com", "TestPass123!")
        self.assertEqual(success.status_code, status.HTTP_200_OK)

    # Test 4 — Admin can deactivate student (state verification)
    def test_deactivate_sets_student_inactive_in_db(self):
        student = make_student("state@example.com")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/admin/students/{student.id}/deactivate/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        student.refresh_from_db()
        self.assertFalse(student.is_active)


class AdminStudentActivityAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin@example.com")
        self.student = make_student("activity@example.com")

    def test_admin_can_view_student_activity(self):
        StudentActivityLog.objects.create(
            student=self.student,
            action="profile_update",
            description="Updated profile",
        )
        StudentActivityLog.objects.create(
            student=self.student,
            action="resume_upload",
            description="Uploaded resume",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            f"/api/admin/students/{self.student.id}/activity/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        actions = [item["action"] for item in response.data["results"]]
        self.assertIn("profile_update", actions)
        self.assertIn("resume_upload", actions)
        self.assertEqual(
            response.data["student"]["email"], "activity@example.com"
        )

    def test_admin_activity_view_for_missing_student_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/admin/students/99999/activity/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthorized_cannot_view_activity(self):
        response = self.client.get(
            f"/api/admin/students/{self.student.id}/activity/"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class StudentActivityLoggingIntegrationTest(TestCase):
    """
    Verify activity logs are generated by real student actions so the
    admin activity endpoint has meaningful data.
    """

    def setUp(self):
        self.client = APIClient()
        self.student = make_student("logger@example.com")

    def test_profile_update_logs_activity(self):
        from apps.students.serializers import StudentProfileSerializer
        self.client.force_authenticate(user=self.student)
        response = self.client.patch(
            "/api/students/me/",
            {"university": "New University"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = StudentActivityLog.objects.filter(
            student=self.student, action="profile_update"
        ).first()
        self.assertIsNotNone(log)
