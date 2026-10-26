import logging
from celery import shared_task
from django.utils import timezone
from .models import CampusLogistics

logger = logging.getLogger(__name__)


@shared_task(name="apps.logistics.tasks.expire_campus_logistics_sweep")
def expire_campus_logistics_sweep() -> dict:
    """
    Celery Beat task running daily at midnight.
    Identifies all campus logistics clearances where current_date > valid_until:
      - Deactivates meal card: meal_card_active = False
      - Sets dormitory status: dorm_status = 'PENDING_KEY_RETURN' (if key was issued and not yet returned)
    """
    today = timezone.now().date()
    expired_records = CampusLogistics.objects.filter(valid_until__lt=today)

    meal_cards_deactivated = 0
    keys_pending_return = 0

    for record in expired_records:
        changed = False

        if record.meal_card_active:
            record.meal_card_active = False
            meal_cards_deactivated += 1
            changed = True

        if record.key_issued and record.dorm_status != CampusLogistics.DormStatus.PENDING_KEY_RETURN and not record.cleared_at_exit:
            record.dorm_status = CampusLogistics.DormStatus.PENDING_KEY_RETURN
            keys_pending_return += 1
            changed = True

        if changed:
            record.save()
            logger.info(
                f"Logistics expired for student {record.student.student_id_number}: "
                f"meal_card_active=False, dorm_status={record.dorm_status}"
            )

    result = {
        "status": "COMPLETED",
        "date": str(today),
        "total_expired_records": expired_records.count(),
        "meal_cards_deactivated": meal_cards_deactivated,
        "keys_pending_return": keys_pending_return,
    }
    logger.info(f"Campus logistics expiration sweep completed: {result}")
    return result
