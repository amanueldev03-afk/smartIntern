from .models import StudentActivityLog


def log_student_activity(
    *,
    student,
    action,
    description="",
    metadata=None,
    ip_address=None,
):
    """
    Lightweight helper to record a student activity in the
    ``StudentActivityLog`` table without throwing — logging is best-effort
    and should never break the primary request flow.
    """
    try:
        return StudentActivityLog.objects.create(
            student=student,
            action=action,
            description=description,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except Exception:
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(
            "Could not log student activity for user %s (action=%s)",
            getattr(student, "id", None),
            action,
        )
        return None
