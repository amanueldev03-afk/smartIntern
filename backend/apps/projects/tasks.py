import logging
from decimal import Decimal
from celery import shared_task
from django.contrib.auth import get_user_model
from apps.projects.models import WeeklyLogbook, LogbookAlert
from ai_engine.services.plagiarism import check_logbook_plagiarism

logger = logging.getLogger(__name__)
User = get_user_model()


def dispatch_plagiarism_alerts(logbook: WeeklyLogbook, score: float, snippet: str) -> int:
    """
    Dispatch in-app alerts to the student's assigned Academic Advisor
    and Company Mentor when a weekly logbook is flagged for plagiarism.
    """
    recipients = set()

    # 1. Directly assigned on the logbook
    if logbook.academic_advisor:
        recipients.add(logbook.academic_advisor)
    if logbook.company_mentor:
        recipients.add(logbook.company_mentor)

    # 2. Fallback: Query system advisors/mentors if not directly assigned
    if not logbook.academic_advisor:
        default_advisor = User.objects.filter(role=User.Role.ADVISOR, is_active=True).first()
        if default_advisor:
            recipients.add(default_advisor)

    if not logbook.company_mentor:
        default_mentor = User.objects.filter(role=User.Role.COMPANY_MENTOR, is_active=True).first()
        if default_mentor:
            recipients.add(default_mentor)

    if not recipients:
        logger.warning(
            f"No Academic Advisor or Company Mentor found for logbook {logbook.id}. "
            "Unable to deliver in-app plagiarism alerts."
        )
        return 0

    student_name = (
        getattr(logbook.student, "full_name", "")
        or getattr(logbook.student, "email", "Student")
    )
    title = f"Plagiarism Alert: Week {logbook.week_number} Logbook Flagged ({score:.1f}%)"
    message = (
        f"Weekly logbook for student '{student_name}' (Week {logbook.week_number}) "
        f"has been flagged for potential plagiarism with a similarity score of {score:.1f}%. "
        f"Matched excerpt: \"{snippet[:180]}...\""
    )

    created_count = 0
    for recipient in recipients:
        LogbookAlert.objects.create(
            logbook=logbook,
            recipient=recipient,
            alert_type=LogbookAlert.AlertType.PLAGIARISM_FLAGGED,
            title=title,
            message=message,
            metadata={
                "similarity_score": float(score),
                "week_number": logbook.week_number,
                "student_id": str(logbook.student_id),
                "student_name": student_name,
                "matched_snippet": snippet[:300],
            },
        )
        created_count += 1
        logger.info(
            f"In-app plagiarism alert dispatched to {recipient.role} "
            f"({recipient.email}) for logbook {logbook.id}"
        )

        try:
            from apps.notifications.services import notify_user
            notify_user(
                user=recipient,
                title=title,
                message=message,
                alert_type="plagiarism_flagged",
                metadata={
                    "logbook_id": str(logbook.id),
                    "similarity_score": float(score),
                    "week_number": logbook.week_number,
                },
            )
        except Exception as e:
            logger.debug(f"notify_user hook encountered: {e}")

    return created_count


@shared_task(bind=True, max_retries=3)
def verify_logbook_task(self, logbook_id):
    """
    Asynchronous Celery task that evaluates a weekly logbook submission
    for plagiarism against historical archives, updates the similarity_score
    and is_flagged flag, and notifies supervisors if flagged.
    """
    logger.info(f"verify_logbook_task started for logbook_id={logbook_id}")

    logbook = (
        WeeklyLogbook.objects
        .select_related("student", "academic_advisor", "company_mentor")
        .filter(id=logbook_id)
        .first()
    )
    if not logbook:
        try:
            from apps.teams.models import WeeklyLogbook as TeamsWeeklyLogbook
            logbook = (
                TeamsWeeklyLogbook.objects
                .select_related("student", "academic_advisor", "company_mentor")
                .filter(id=logbook_id)
                .first()
            )
        except Exception:
            pass

    if not logbook:
        logger.error(f"WeeklyLogbook {logbook_id} not found — task aborted.")
        return {"status": "not_found", "logbook_id": str(logbook_id)}

    text_to_screen = logbook.tasks_executed or ""
    score, is_flagged, snippet = check_logbook_plagiarism(
        new_text=text_to_screen,
        student_id=str(logbook.student_id),
        week_number=logbook.week_number,
        logbook_id=str(logbook.id),
    )

    logbook.similarity_score = Decimal(f"{score:.2f}")
    logbook.is_flagged = is_flagged
    logbook.matched_snippet = snippet
    logbook.save(update_fields=["similarity_score", "is_flagged", "matched_snippet", "updated_at"])

    alerts_sent = 0
    if is_flagged:
        alerts_sent = dispatch_plagiarism_alerts(logbook, score, snippet)

    logger.info(
        f"verify_logbook_task completed for logbook {logbook.id}: "
        f"score={score}%, is_flagged={is_flagged}, alerts_sent={alerts_sent}"
    )

    return {
        "status": "completed",
        "logbook_id": str(logbook.id),
        "similarity_score": float(score),
        "is_flagged": is_flagged,
        "alerts_sent": alerts_sent,
    }
