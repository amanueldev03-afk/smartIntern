import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.postings.tasks.recalculate_posting_embeddings_task")
def recalculate_posting_embeddings_task(posting_id: int) -> bool:
    """
    Celery task to recalculate 384-dimensional vector embedding for an InternshipPosting.
    Generates semantic embedding from title, track, description, location, and required skills,
    mirroring the existing aggregator pipeline without altering existing tables.
    """
    from apps.postings.models import InternshipPosting
    from ai_engine.models.loader import get_embedding

    try:
        posting = (
            InternshipPosting.objects
            .prefetch_related("required_skills")
            .select_related("owner_department", "owner_company")
            .get(pk=posting_id)
        )
    except InternshipPosting.DoesNotExist:
        logger.warning(f"Posting {posting_id} not found for embedding recalculation.")
        return False

    try:
        # Build structured text representation for embedding
        skills = [s.name for s in posting.required_skills.all()]
        text_lines = [
            f"Title: {posting.title}",
            f"Track: {posting.get_track_display()}",
            f"Description: {posting.description}",
        ]
        if skills:
            text_lines.append(f"Required Skills: {', '.join(sorted(skills))}")
        if posting.city:
            text_lines.append(f"City: {posting.city}")
        if posting.owner_department:
            text_lines.append(f"Department: {posting.owner_department.department_name}")
        if posting.owner_company and posting.owner_company.company:
            text_lines.append(f"Company: {posting.owner_company.company.name}")

        text = "\n".join(text_lines)
        vector = get_embedding(text)

        posting.embedding = vector
        posting.save(update_fields=["embedding"])
        logger.info(f"Successfully updated embedding for posting {posting_id}")
        return True
    except Exception as exc:
        logger.error(f"Failed to calculate embedding for posting {posting_id}: {exc}")
        return False
