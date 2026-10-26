"""
Celery tasks for administration and system maintenance.
"""

import logging
from celery import shared_task
from .backup_service import DatabaseBackupService, DatabaseBackupError

logger = logging.getLogger(__name__)


@shared_task(name="apps.administration.tasks.backup_database_daily", bind=True, max_retries=3)
def backup_database_daily(self, retention_days: int = 30):
    """
    Automated daily PostgreSQL database backup task scheduled via Celery Beat.
    Dumps the database, generates checksum, uploads to S3, and enforces retention.
    """
    logger.info("Executing automated daily PostgreSQL backup task...")
    try:
        service = DatabaseBackupService()
        result = service.create_backup(upload=True, retention_days=retention_days)
        logger.info(
            "Automated daily backup successful: s3_key=%s, size=%d bytes",
            result.get("s3_key"),
            result.get("size_bytes", 0),
        )
        return result
    except DatabaseBackupError as exc:
        logger.error("Daily database backup failed with DatabaseBackupError: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    except Exception as exc:
        logger.exception("Unexpected error during daily database backup: %s", exc)
        raise self.retry(exc=exc, countdown=300)
