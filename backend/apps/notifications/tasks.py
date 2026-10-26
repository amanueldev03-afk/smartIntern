from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail


@shared_task
def send_high_score_recommendation_notification(recommendation_id):
    """Email a student about one newly-created high-score recommendation."""
    from apps.recommendations.models import Recommendation

    recommendation = (
        Recommendation.objects
        .select_related("student", "internship")
        .filter(pk=recommendation_id)
        .first()
    )
    if not recommendation or not recommendation.student.email:
        return {"status": "skipped", "recommendation_id": recommendation_id}

    threshold = getattr(settings, "NOTIFICATION_HIGH_SCORE_THRESHOLD", 80)
    if recommendation.overall_score < threshold:
        return {"status": "skipped", "recommendation_id": recommendation_id}

    internship_url = f"{settings.SITE_BASE_URL}/internships/{recommendation.internship_id}"
    send_mail(
        subject="A high-match internship is waiting for you",
        message=(
            f"Hello {recommendation.student.first_name or recommendation.student.username},\n\n"
            f"We found a new high-match internship recommendation for you:\n"
            f"{recommendation.internship.title} at {recommendation.internship.organization_name}\n"
            f"Match score: {recommendation.overall_score}\n\n"
            f"View the internship: {internship_url}\n"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recommendation.student.email],
        fail_silently=False,
    )
    return {"status": "sent", "recommendation_id": recommendation_id}


@shared_task
def send_saved_internship_update_notifications(internship_id):
    """Email every student who saved an internship about its current update."""
    from apps.internships.models import Internship

    internship = Internship.objects.filter(pk=internship_id).first()
    if not internship:
        return {"status": "skipped", "internship_id": internship_id, "sent": 0}

    recipients = list(
        internship.saved_by_students
        .filter(student__email__isnull=False)
        .exclude(student__email="")
        .values_list("student__email", flat=True)
    )
    if not recipients:
        return {"status": "skipped", "internship_id": internship_id, "sent": 0}

    internship_url = f"{settings.SITE_BASE_URL}/internships/{internship.id}"
    for recipient in recipients:
        send_mail(
            subject="A saved internship was updated",
            message=(
                f"An internship you saved was updated:\n\n"
                f"{internship.title} at {internship.organization_name}\n\n"
                f"View the updated internship: {internship_url}\n"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
    return {"status": "sent", "internship_id": internship_id, "sent": len(recipients)}
