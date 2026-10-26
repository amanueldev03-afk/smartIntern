"""
apps/data_sources/tasks.py — Celery tasks for the DataSource collection
pipeline (Task 5.10, Section 3.10.1 / Figure 3.8).

Celery Beat triggers periodic collection of active ``DataSource`` rows by
source type (API every few hours, RSS every few hours) and the daily
expiry check. Admins can also trigger collection of a single source
immediately via ``POST /api/admin/data-sources/<id>/sync-now/``, which
queues the very same ``collect_data_source`` task.
"""

import logging

from celery import shared_task
from django.utils import timezone

from .models import DataSource
from .adapters import get_adapter
from .services.dedupe import store_listing
from .services.normalization import normalize_listing


logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def collect_data_source(self, source_id):
    """
    Collect internship listings from one ``DataSource``.

    Fetches raw listings via the source's adapter, normalizes each onto
    the internal Task 1.5 schema, and stores them through the shared
    dedupe pipeline (``store_listing``), which also queues per-listing
    URL validation (Task 5.9). Inactive sources are skipped.

    Task 5.11 — Idempotency & fault isolation (NFR, Section 2.5):
    Each listing's processing is wrapped in try/except with logging so that
    one listing failing never blocks the others from the same source.

    Returns a summary dict with created/duplicate/near-duplicate counts.
    """
    source = DataSource.objects.filter(pk=source_id).first()

    if source is None:
        return {
            "status": "not_found",
            "message": "Data source not found.",
            "source_id": source_id,
        }

    if not source.is_active:
        return {
            "status": "skipped",
            "message": "Data source is inactive.",
            "source_id": source.id,
        }

    try:
        adapter = get_adapter(source)
        raw_listings = adapter.fetch()
    except Exception as exc:
        logger.error(
            f"Failed to fetch listings from data source: {source.name} "
            f"(id={source.id}, type={source.type}): {exc}",
            exc_info=True,
        )
        return {
            "status": "fetch_failed",
            "source_id": source.id,
            "source_type": source.type,
            "error": str(exc),
        }

    created = 0
    duplicate = 0
    near_duplicate = 0
    processing_errors = 0

    for raw in raw_listings:
        try:
            normalized = normalize_listing(raw, source_type=source.type)
            result = store_listing(normalized, data_source=source)
            if result.action == "created":
                created += 1
            elif result.action == "duplicate":
                duplicate += 1
            elif result.action == "near_duplicate":
                near_duplicate += 1
        except Exception as exc:
            processing_errors += 1
            logger.warning(
                f"Failed to process listing from data source: {source.name} "
                f"(id={source.id}): {exc}. Raw data: {raw}",
                exc_info=True,
            )

    source.last_synced_at = timezone.now()
    source.save(update_fields=["last_synced_at", "updated_at"])

    return {
        "status": "success",
        "source_id": source.id,
        "source_type": source.type,
        "records_found": len(raw_listings),
        "records_created": created,
        "records_duplicate": duplicate,
        "records_near_duplicate": near_duplicate,
        "records_processing_errors": processing_errors,
    }


@shared_task
def schedule_data_source_collections(source_type=None):
    """
    Queue ``collect_data_source`` for every active ``DataSource``.

    ``source_type`` optionally restricts the fan-out to a single type
    (e.g. ``DataSource.Type.API``) so that API and RSS feeds can run on
    independent intervals via separate Celery Beat entries.

    Task 5.11 — Idempotency & fault isolation (NFR, Section 2.5):
    Each source's collection is wrapped in try/except with logging so that
    one source failing never blocks the others. This ensures fault isolation
    across the scheduled run.
    """
    sources = DataSource.objects.filter(is_active=True)

    if source_type:
        sources = sources.filter(type=source_type)

    queued = 0
    failed = 0
    errors = []

    for source in sources:
        try:
            collect_data_source.delay(source.id)
            queued += 1
            logger.info(
                f"Successfully queued collection for data source: {source.name} "
                f"(id={source.id}, type={source.type})"
            )
        except Exception as exc:
            failed += 1
            error_msg = (
                f"Failed to queue collection for data source: {source.name} "
                f"(id={source.id}, type={source.type}): {exc}"
            )
            logger.error(error_msg, exc_info=True)
            errors.append({
                "source_id": source.id,
                "source_name": source.name,
                "source_type": source.type,
                "error": str(exc),
            })

    return {
        "status": "completed",
        "source_type": source_type,
        "sources_queued": queued,
        "sources_failed": failed,
        "errors": errors,
    }
