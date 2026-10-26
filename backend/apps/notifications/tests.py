from django.core import mail
from django.test import TestCase
from django.utils import timezone

from apps.internships.models import Internship, SavedInternship
from apps.recommendations.models import Recommendation
from apps.notifications.tasks import (
    send_high_score_recommendation_notification,
    send_saved_internship_update_notifications,
)


class NotificationTaskTest(TestCase):
    def setUp(self):
        self.student = self._create_student("student@example.com")
        self.other_student = self._create_student("other@example.com")
        self.internship = Internship.objects.create(
            title="Backend Intern",
            organization_name="Tech Corp",
            description="Build APIs",
            application_url="https://example.com/apply",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )

    def _create_student(self, email):
        from django.contrib.auth import get_user_model
        return get_user_model().objects.create_user(
            email=email,
            username=email.split("@")[0],
            password="TestPassword123!",
            role="student",
        )

    def test_high_score_task_sends_expected_email(self):
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85,
        )

        result = send_high_score_recommendation_notification.run(
            recommendation.id)

        self.assertEqual(result["status"], "sent")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.student.email])
        self.assertIn("high-match", mail.outbox[0].subject)
        self.assertIn(self.internship.title, mail.outbox[0].body)
        self.assertIn(str(recommendation.overall_score), mail.outbox[0].body)

    def test_low_score_task_does_not_send_email(self):
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=79,
        )

        result = send_high_score_recommendation_notification.run(
            recommendation.id)

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(len(mail.outbox), 0)

    def test_saved_update_notifies_only_savers(self):
        SavedInternship.objects.create(
            student=self.student, internship=self.internship)
        self.internship.title = "Updated Backend Intern"
        self.internship.updated_at = timezone.now()
        self.internship.save(update_fields=["title", "updated_at"])

        result = send_saved_internship_update_notifications.run(
            self.internship.id)

        self.assertEqual(result["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.student.email])
        self.assertIn("updated", mail.outbox[0].subject)
        self.assertIn(self.internship.title, mail.outbox[0].body)
        self.assertNotIn(self.other_student.email, mail.outbox[0].to)

    def test_saved_update_notifies_multiple_savers(self):
        SavedInternship.objects.create(
            student=self.student, internship=self.internship)
        SavedInternship.objects.create(
            student=self.other_student, internship=self.internship)

        send_saved_internship_update_notifications.run(self.internship.id)

        self.assertEqual(len(mail.outbox), 2)
        self.assertCountEqual(
            [message.to[0] for message in mail.outbox],
            [self.student.email, self.other_student.email],
        )

    def test_unsaved_internship_does_not_send_email(self):
        result = send_saved_internship_update_notifications.run(
            self.internship.id)

        self.assertEqual(result["sent"], 0)
        self.assertEqual(len(mail.outbox), 0)

# Create your tests here.
