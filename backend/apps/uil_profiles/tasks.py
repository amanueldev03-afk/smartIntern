import logging
from celery import shared_task
from django.db import transaction

from apps.uil_profiles.models import Resume
from ai_engine.parsers.cv_extractor import extract_resume_data

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def parse_resume_task(self, resume_id: int):
    """
    Asynchronously parses an uploaded student resume document.

    Extracts plain text and structured entity suggestions:
      - contact information (email, phone, github_url, linkedin_url)
      - academic credentials (GPA, university, field of study, degree)
      - canonical skills matched against the Skill database table

    GUARDRAIL ENFORCEMENT:
    This task MUST NEVER auto-write into UILStudentProfile or Student profile fields.
    Extracted data is stored strictly in Resume.parsed_data as proposals/suggestions
    for the student to review and accept field-by-field via the user confirmation endpoint.
    """
    logger.info("Starting resume extraction task for Resume ID %s", resume_id)
    try:
        resume = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        logger.error("Resume with ID %s not found.", resume_id)
        return {"status": "NOT_FOUND", "resume_id": resume_id}

    try:
        resume.parsing_status = Resume.ParsingStatus.PROCESSING
        resume.save(update_fields=["parsing_status", "updated_at"])

        # Run extraction pipeline
        result = extract_resume_data(resume.file)
        extracted_text = result.get("text", "")
        parsed_data = result.get("data", {})

        with transaction.atomic():
            resume.extracted_text = extracted_text
            resume.parsed_data = parsed_data
            resume.parsing_status = Resume.ParsingStatus.COMPLETED
            resume.error_message = ""
            resume.save(
                update_fields=[
                    "extracted_text",
                    "parsed_data",
                    "parsing_status",
                    "error_message",
                    "updated_at",
                ]
            )

        logger.info(
            "Resume %s parsed successfully. Skills found: %d, GPA: %s",
            resume_id,
            len(parsed_data.get("skills", [])),
            parsed_data.get("gpa"),
        )
        return {
            "status": "COMPLETED",
            "resume_id": resume_id,
            "skills_count": len(parsed_data.get("skills", [])),
            "gpa": parsed_data.get("gpa"),
            "email": parsed_data.get("email"),
        }

    except Exception as exc:
        logger.exception("Error parsing resume %s: %s", resume_id, exc)
        resume.parsing_status = Resume.ParsingStatus.FAILED
        resume.error_message = str(exc)
        resume.save(update_fields=["parsing_status", "error_message", "updated_at"])
        return {
            "status": "FAILED",
            "resume_id": resume_id,
            "error": str(exc),
        }
