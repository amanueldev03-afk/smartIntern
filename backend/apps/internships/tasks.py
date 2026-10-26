import logging
from celery import shared_task
from django.utils import timezone

from .models import Internship, InternshipSource
from .services.collector import collect_source
from .services.embedding_service import regenerate_internship_embedding
from apps.data_sources.services.urlcheck import validate_listing_urls


logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={
        "max_retries": 3,
    },
)
def collect_internships_from_source(
    self,
    source_id,
):
    """
    Collect internships from one source
    in a background Celery worker.
    """

    source = InternshipSource.objects.get(
        id=source_id
    )

    if not source.is_active:
        return {
            "status": "skipped",
            "message": (
                "Source is inactive."
            ),
            "source_id": source.id,
        }

    log = collect_source(source)

    return {
        "status": log.status,
        "source_id": source.id,
        "collection_log_id": log.id,
        "records_found": log.records_found,
        "records_created": (
            log.records_created
        ),
        "records_updated": (
            log.records_updated
        ),
        "records_failed": (
            log.records_failed
        ),
    }


@shared_task
def schedule_active_source_collections():
    """
    Queue collection jobs for every active
    internship source.
    """

    sources = InternshipSource.objects.filter(
        is_active=True
    )

    queued = 0

    for source in sources:

        collect_internships_from_source.delay(
            source.id
        )

        queued += 1

    return {
        "status": "success",
        "sources_queued": queued,
    }


@shared_task
def expire_internships():
    """
    Daily task — expire active internships whose deadline is strictly
    before today (Section 3.10.7, Task 5.8).

    Scheduled by Celery Beat at 00:00 UTC. A listing whose
    ``deadline`` has already passed is flipped to ``expired`` so it
    drops out of the Phase 4 active search results.
    """

    today = timezone.localdate()

    expired_count = (
        Internship.objects
        .filter(
            deadline__lt=today,
            status=Internship.STATUS_ACTIVE,
        )
        .update(
            status=Internship.STATUS_EXPIRED,
        )
    )

    return {
        "status": "success",
        "expired_count": expired_count,
        "expired_before": today.isoformat(),
    }


@shared_task
def validate_listing_urls_task(internship_id):
    """
    Async URL validation for one collected listing (Section 3.10.8,
    Task 5.9).

    Sends HEAD (fallback GET) requests to the listing's
    ``application_url`` and ``source_url``. Listings with any invalid
    or unreachable link are flagged ``needs_review=True`` and kept off
    the student-facing feed (status stays ``draft``) for admin review;
    listings whose links all resolve are auto-published.
    """

    internship = Internship.objects.get(id=internship_id)

    result = validate_listing_urls(
        internship.application_url,
        internship.source_url or "",
    )

    checks = result["checks"]
    low_confidence_skills = [
        entry
        for entry in internship.skills_review or []
        if entry.get("low_confidence")
    ]

    needs_review = bool(result["invalid_urls"]) or bool(
        low_confidence_skills
    )

    internship.url_validation = checks
    internship.validated_at = timezone.now()
    internship.needs_review = needs_review

    if needs_review:
        internship.status = Internship.STATUS_DRAFT
    else:
        internship.status = Internship.STATUS_ACTIVE
        internship.is_verified = True

    internship.save(
        update_fields=[
            "url_validation",
            "validated_at",
            "needs_review",
            "status",
            "is_verified",
            "updated_at",
        ]
    )

    return {
        "internship_id": internship.id,
        "status": internship.status,
        "needs_review": needs_review,
        "invalid_urls": result["invalid_urls"],
    }


@shared_task(
    bind=True,
    max_retries=3,
)
def generate_internship_embedding_task(self, internship_id):
    """
    Generate embedding for an internship in the background.
    This task is idempotent - it will update the embedding if it already exists.
    """
    logger.info(f"Starting internship embedding generation for internship ID: {internship_id}")
    
    try:
        # 1. Load internship
        internship = Internship.objects.get(id=internship_id)
        logger.info(f"Internship found: {internship.id}")
        
        # 2. Update status to PROCESSING
        internship.embedding_status = Internship.EMBEDDING_STATUS_PROCESSING
        internship.embedding_error = None
        internship.save(update_fields=["embedding_status", "embedding_error"])
        logger.info(f"Internship embedding status updated to PROCESSING")
        
        # 3. Generate embedding (idempotent - updates if exists)
        logger.info(f"Generating embedding")
        embedding = regenerate_internship_embedding(internship)
        logger.info(f"Embedding generated successfully")
        
        # 4. Update status to COMPLETED
        internship.embedding_status = Internship.EMBEDDING_STATUS_COMPLETED
        internship.save(update_fields=["embedding_status"])
        logger.info(f"Internship embedding generation completed successfully for ID: {internship_id}")
        
        return {
            "internship_id": internship.id,
            "status": "completed",
        }
        
    except Internship.DoesNotExist:
        logger.error(f"Internship not found: {internship_id}")
        raise
    except Exception as exc:
        logger.error(f"Internship embedding generation failed for internship {internship_id}: {str(exc)}", exc_info=True)
        
        # Update status to FAILED if max retries reached
        if self.request.retries >= self.max_retries:
            internship.embedding_status = Internship.EMBEDDING_STATUS_FAILED
            internship.embedding_error = str(exc)
            internship.save(update_fields=["embedding_status", "embedding_error"])
            logger.error(f"Internship embedding marked as FAILED after {self.max_retries} retries")
            raise
        
        # Retry with exponential backoff
        logger.warning(f"Retrying internship embedding generation, attempt {self.request.retries + 1}/{self.max_retries}")
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@shared_task(
    bind=True,
    max_retries=3,
)
def generate_missing_internship_embeddings(self):
    """
    Bulk task to generate embeddings for all internships that don't have one.
    This is useful for migrating existing data after Celery implementation.
    """
    logger.info("Starting bulk internship embedding generation")
    
    try:
        # Find all internships without embeddings
        internships_without_embeddings = Internship.objects.filter(embedding__isnull=True)
        count = internships_without_embeddings.count()
        logger.info(f"Found {count} internships without embeddings")
        
        # Queue individual embedding tasks
        for internship in internships_without_embeddings:
            generate_internship_embedding_task.delay(internship.id)
        
        logger.info(f"Queued {count} internship embedding tasks")
        return {
            "status": "queued",
            "count": count,
        }
        
    except Exception as exc:
        logger.error(f"Bulk internship embedding generation failed: {str(exc)}", exc_info=True)
        raise