import logging
from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import CV, StudentProfile, Resume
from .services.cv_extraction import extract_cv_text
from .services.cv_analysis import analyze_cv                    # deterministic parser
from .services.ai_cv_analysis import analyze_cv_intelligently   # AI merger
from .services.skill_sync import sync_cv_skills_to_profile
from .services.auto_profile_fill import auto_fill_profile_from_cv
from ..internships.services.embedding_service import regenerate_student_embedding

logger = logging.getLogger(__name__)

_UNRECOVERABLE = (ValueError, FileNotFoundError)


def _mark_failed(cv, reason: str) -> None:
    """Persist FAILED status without raising."""
    try:
        cv.processing_status = CV.STATUS_FAILED
        cv.processing_error  = str(reason)[:2000]
        cv.save(update_fields=["processing_status", "processing_error"])
        logger.error(f"CV {cv.id} marked FAILED: {reason}")
    except Exception as e:
        logger.error(f"Could not persist FAILED status for CV {cv.id}: {e}")


def _complete_cv_processing(cv, text: str) -> dict:
    """
    Shared pipeline used by both ``process_cv`` (general CV flow) and
    ``parse_resume`` (Phase 3 Task 3.5, resume flow).

    Given a CV record with already-extracted ``text``, it runs the
    deterministic + AI analysis, persists the extracted fields, syncs skills
    to the student profile, regenerates the embedding inline, marks the CV
    COMPLETED, and busts the recommendation cache.

    Never raises for analysis/embedding failures — those are non-fatal and
    logged so the CV still completes with whatever was extracted.
    """
    # 4. Deterministic parser — always produces something useful
    try:
        basic_analysis = analyze_cv(text)
        logger.info(
            f"CV {cv.id} — deterministic parse: "
            f"{len(basic_analysis.get('skills', []))} skills, "
            f"{len(basic_analysis.get('experience', []))} experience items"
        )
    except Exception as exc:
        logger.warning(f"CV {cv.id} deterministic parse error: {exc}")
        basic_analysis = {
            "skills": [], "education": [],
            "experience": [], "projects": [], "certifications": [],
            "languages": [],
        }

    # 5. AI analysis — merges with deterministic result; falls back on any failure
    try:
        analysis = analyze_cv_intelligently(text, basic_analysis)
        logger.info(
            f"CV {cv.id} — final analysis: "
            f"{len(analysis.get('skills', []))} skills"
        )
    except Exception as exc:
        logger.warning(f"CV {cv.id} AI analysis error (using basic): {exc}")
        analysis = basic_analysis

    # Guarantee we always have at least the deterministic skills
    if not analysis.get("skills") and basic_analysis.get("skills"):
        analysis["skills"] = basic_analysis["skills"]

    # 6. Persist extracted data
    cv.extracted_text           = text
    cv.extracted_skills         = analysis.get("skills",         [])
    cv.extracted_education      = analysis.get("education",      [])
    cv.extracted_experience     = analysis.get("experience",     [])
    cv.extracted_projects       = analysis.get("projects",       [])
    cv.extracted_certifications = analysis.get("certifications", [])
    cv.extracted_languages      = analysis.get("languages",      [])
    cv.extracted_experience_years = analysis.get("experience_years", 0.0)
    try:
        with transaction.atomic():
            cv.save(update_fields=[
                "extracted_text",
                "extracted_skills",
                "extracted_education",
                "extracted_experience",
                "extracted_projects",
                "extracted_certifications",
                "extracted_languages",
                "extracted_experience_years",
            ])
    except CV.NotUpdated:
        logger.info(f"CV {cv.id} was replaced while processing; ignoring stale task")
        return {"cv_id": cv.id, "status": "superseded"}
    logger.info(f"CV {cv.id} — extracted data saved to DB")

    # 7. Sync skills to student profile M2M
    try:
        profile = StudentProfile.objects.get(user=cv.student)
        # Phase 6 Task 6.1: Mark skills as source='resume' when extracted from CV
        sync_cv_skills_to_profile(profile, cv.extracted_skills, source="resume")
        logger.info(f"CV {cv.id} — {len(cv.extracted_skills)} skills synced to profile (source=resume)")
    except StudentProfile.DoesNotExist:
        logger.warning(f"CV {cv.id} — no StudentProfile for user {cv.student_id}, skipping sync")
        profile = None
    except Exception as exc:
        logger.warning(f"CV {cv.id} — skill sync failed (non-fatal): {exc}")
        try:
            profile = StudentProfile.objects.get(user=cv.student)
        except Exception:
            profile = None

    # 7.5 Auto-fill profile from CV data
    if profile:
        try:
            cv_data = {
                'extracted_skills': cv.extracted_skills,
                'extracted_education': cv.extracted_education,
                'extracted_experience': cv.extracted_experience,
            }
            auto_fill_result = auto_fill_profile_from_cv(profile, cv_data)
            logger.info(f"CV {cv.id} — auto-fill: {auto_fill_result}")
            
            # If profile is now 100% complete, trigger AI recommendations
            if auto_fill_result.get('is_complete'):
                logger.info(f"CV {cv.id} — profile 100% complete, triggering AI recommendations")
                try:
                    from apps.recommendations.tasks import generate_recommendations_for_user
                    generate_recommendations_for_user.delay(cv.student_id)
                except Exception as exc:
                    logger.warning(f"CV {cv.id} — failed to trigger recommendations: {exc}")
        except Exception as exc:
            logger.warning(f"CV {cv.id} — auto-fill failed (non-fatal): {exc}")

    # 8. Generate student embedding INLINE
    #    We do NOT use .delay() here because calling broker.send from inside
    #    a Celery worker can fail with connection errors on some setups.
    #    Running it inline is safe — the model is already cached in this worker.
    if profile:
        try:
            embedding = regenerate_student_embedding(profile)
            logger.info(
                f"CV {cv.id} — student embedding generated "
                f"(dim={len(embedding) if embedding else 0})"
            )
        except Exception as exc:
            logger.warning(f"CV {cv.id} — embedding generation failed (non-fatal): {exc}")
    else:
        logger.warning(f"CV {cv.id} — skipping embedding, no profile available")

    # 9. Mark COMPLETED
    cv.processing_status = CV.STATUS_COMPLETED
    cv.processed_at      = timezone.now()
    try:
        with transaction.atomic():
            cv.save(update_fields=["processing_status", "processed_at"])
    except CV.NotUpdated:
        logger.info(f"CV {cv.id} was replaced before completion; ignoring stale task")
        return {"cv_id": cv.id, "status": "superseded"}
    logger.info(f"CV {cv.id} → COMPLETED at {cv.processed_at}")

    # 10. Bust recommendation cache
    try:
        from apps.recommendations.views import bust_recommendation_cache
        bust_recommendation_cache(cv.student_id)
        logger.info(f"CV {cv.id} — recommendation cache busted for user {cv.student_id}")
    except Exception as exc:
        logger.warning(f"CV {cv.id} — cache bust failed (non-fatal): {exc}")

    return {
        "cv_id":          cv.id,
        "status":         "completed",
        "skills_count":   len(cv.extracted_skills),
        "education_count": len(cv.extracted_education),
        "experience_count": len(cv.extracted_experience),
    }


@shared_task(bind=True, max_retries=3)
def test_celery_task(self):
    """Simple task to verify Celery is working."""
    logger.info("Test Celery task executed successfully")
    return "Celery is working"


@shared_task(bind=True, max_retries=3)
def process_cv(self, cv_id: int):
    """
    Process a student CV end-to-end:

      1. Load CV record
      2. Set PROCESSING
      3. Open file from Django storage and extract raw text
      4. Run deterministic parser  → basic_analysis  (always works)
      5. Run OpenAI analysis       → merged_analysis (falls back to basic on failure)
      6. Save all extracted fields
      7. Sync skills to student profile M2M
      8. Generate student embedding INLINE (avoids broker subtask issue)
      9. Set COMPLETED + processed_at
     10. Bust recommendation cache
    """
    logger.info(f"process_cv started — cv_id={cv_id}")

    # ------------------------------------------------------------------
    # 1. Load CV
    # ------------------------------------------------------------------
    try:
        cv = CV.objects.select_related("student").get(id=cv_id)
    except CV.DoesNotExist:
        logger.error(f"CV {cv_id} not found — aborting.")
        return

    # ------------------------------------------------------------------
    # 2. Mark PROCESSING
    # ------------------------------------------------------------------
    cv.processing_status = CV.STATUS_PROCESSING
    cv.processing_error  = None
    cv.save(update_fields=["processing_status", "processing_error"])
    logger.info(f"CV {cv_id} → PROCESSING")

    # ------------------------------------------------------------------
    # 3. Extract text from file
    #    Use cv.file.open() so this works in Celery workers that run in a
    #    different process/container from the web server.
    # ------------------------------------------------------------------
    try:
        cv.file.open("rb")
        text = extract_cv_text(cv.file)
        cv.file.close()
    except _UNRECOVERABLE as exc:
        _mark_failed(cv, str(exc))
        return
    except Exception as exc:
        logger.error(f"CV {cv_id} extraction error: {exc}", exc_info=True)
        if self.request.retries >= self.max_retries:
            _mark_failed(cv, str(exc))
            raise
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))

    if not text or len(text.strip()) < 30:
        reason = (
            f"Extracted text too short ({len(text.strip()) if text else 0} chars). "
            "The PDF may contain scanned images rather than selectable text."
        )
        _mark_failed(cv, reason)
        return

    logger.info(f"CV {cv_id} — extracted {len(text)} chars")

    # 4-10. Deterministic + AI analysis, persist, sync skills, embedding,
    #       mark COMPLETED, bust cache — shared with parse_resume (Task 3.5).
    return _complete_cv_processing(cv, text)


@shared_task(bind=True, max_retries=3)
def parse_resume(self, student_id: int):
    """
    Phase 3 Task 3.5 — parse a student's resume asynchronously.

    Queued via ``parse_resume.delay(student_id)`` on a successful resume
    upload (POST /api/students/me/resume/). ``student_id`` is the auth
    ``User`` id (CV records are keyed by ``CV.student`` = the user).

    It loads the student's most recently uploaded ``CV``, extracts text, runs
    the shared parsing pipeline, and sets ``StudentProfile.resume_parsed =
    True`` (+ ``resume_parsed_at``) so callers can confirm the async run.

    Fully wired broker arrives in Phase 5; this task can be run synchronously
    today with ``CELERY_TASK_ALWAYS_EAGER=True`` (dev/test).
    """
    logger.info(f"parse_resume started — student_id={student_id}")

    # Load the latest uploaded resume/CV record for this student.
    cv = (
        CV.objects.filter(student_id=student_id)
        .order_by("-created_at")
        .first()
    )
    if cv is None:
        logger.error(f"parse_resume — no CV found for student_id={student_id}")
        return {"status": "no_cv", "student_id": student_id}

    # Mark PROCESSING
    cv.processing_status = CV.STATUS_PROCESSING
    cv.processing_error  = None
    cv.save(update_fields=["processing_status", "processing_error"])

    # Extract text (re-validating the file — defense in depth, Section 7.6.5).
    try:
        cv.file.open("rb")
        text = extract_cv_text(cv.file)
        cv.file.close()
    except _UNRECOVERABLE as exc:
        _mark_failed(cv, str(exc))
        return {"status": "failed", "student_id": student_id, "reason": str(exc)}
    except Exception as exc:
        logger.error(f"parse_resume — extraction error for CV {cv.id}: {exc}", exc_info=True)
        if self.request.retries >= self.max_retries:
            _mark_failed(cv, str(exc))
            raise
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))

    if not text or len(text.strip()) < 30:
        reason = (
            f"Extracted text too short ({len(text.strip()) if text else 0} chars). "
            "The PDF may contain scanned images rather than selectable text."
        )
        _mark_failed(cv, reason)
        return {"status": "failed", "student_id": student_id, "reason": reason}

    logger.info(f"parse_resume — CV {cv.id} extracted {len(text)} chars")

    # Run the shared parsing pipeline (analysis, persist, sync, embedding, cache).
    result = _complete_cv_processing(cv, text)

    if result.get("status") == "superseded":
        result["student_id"] = student_id
        return result

    # Confirm the async parse by setting the resume_parsed flag.
    try:
        profile = StudentProfile.objects.get(user_id=student_id)
        profile.resume_parsed     = True
        profile.resume_parsed_at  = timezone.now()
        profile.save(update_fields=["resume_parsed", "resume_parsed_at", "updated_at"])
        logger.info(f"parse_resume — resume_parsed=True set for student profile {profile.id}")
        result["resume_parsed"] = True
    except StudentProfile.DoesNotExist:
        logger.warning(f"parse_resume — no StudentProfile for user {student_id}, flag not set")

    result["student_id"] = student_id
    return result



@shared_task(bind=True, max_retries=3)
def generate_student_embedding_task(self, profile_id: int):
    """
    Standalone task for regenerating a student embedding on demand
    (e.g. after profile update or skill add).
    Does NOT spawn sub-tasks — runs the embedding inline.
    """
    logger.info(f"generate_student_embedding_task — profile_id={profile_id}")
    try:
        profile   = StudentProfile.objects.get(id=profile_id)
        embedding = regenerate_student_embedding(profile)
        logger.info(f"Embedding generated — profile={profile_id}, dim={len(embedding)}")
        return {"profile_id": profile_id, "status": "completed"}
    except StudentProfile.DoesNotExist:
        logger.error(f"StudentProfile {profile_id} not found")
        raise
    except Exception as exc:
        logger.error(f"Embedding failed for profile {profile_id}: {exc}", exc_info=True)
        if self.request.retries >= self.max_retries:
            raise
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@shared_task(bind=True, max_retries=3)
def generate_missing_student_embeddings(self):
    """Backfill embeddings for every StudentProfile that has none."""
    logger.info("generate_missing_student_embeddings started")
    try:
        profiles = StudentProfile.objects.filter(embedding__isnull=True)
        count    = profiles.count()
        for profile in profiles:
            generate_student_embedding_task.delay(profile.id)
        logger.info(f"Queued {count} embedding tasks")
        return {"status": "queued", "count": count}
    except Exception as exc:
        logger.error(f"Bulk embedding generation failed: {exc}", exc_info=True)
        raise


@shared_task(bind=True, max_retries=3)
def parse_resume_task(self, resume_id: int):
    """
    Task 2.2: Asynchronous resume extraction pipeline that parses entities
    (GPA, GitHub/LinkedIn URLs, email, phone, education, skills) and
    updates both the Resume record and empty fields on StudentProfile.
    """
    logger.info(f"parse_resume_task started — resume_id={resume_id}")

    try:
        resume = Resume.objects.select_related("student__user").get(id=resume_id)
    except Resume.DoesNotExist:
        logger.error(f"Resume {resume_id} not found — aborting task.")
        return {"status": "not_found", "resume_id": resume_id}

    # Mark PROCESSING
    resume.parsing_status = Resume.ParsingStatus.PROCESSING
    resume.save(update_fields=["parsing_status", "updated_at"])

    # Extract text and entities
    from ai_engine.parsers.cv_extractor import extract_resume_data
    try:
        resume.file.open("rb")
        result = extract_resume_data(resume.file)
        resume.file.close()
    except Exception as exc:
        logger.error(f"Resume {resume_id} extraction failed: {exc}", exc_info=True)
        resume.parsing_status = Resume.ParsingStatus.FAILED
        resume.parsed_data = {"error": str(exc)}
        resume.save(update_fields=["parsing_status", "parsed_data", "updated_at"])
        if self.request.retries >= self.max_retries:
            return {"status": "failed", "resume_id": resume_id, "error": str(exc)}
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))

    text = result.get("text", "")
    data = result.get("data", {})

    resume.extracted_text = text
    resume.parsed_data = data
    resume.parsing_status = Resume.ParsingStatus.COMPLETED
    resume.save(update_fields=["extracted_text", "parsed_data", "parsing_status", "updated_at"])
    logger.info(f"Resume {resume_id} extraction completed successfully.")

    # Populate empty fields on StudentProfile
    profile = resume.student
    if profile:
        profile_fields_to_update = []

        # Phone
        extracted_phone = data.get("phone")
        if extracted_phone and not profile.phone:
            profile.phone = extracted_phone
            profile_fields_to_update.append("phone")
            if hasattr(profile.user, "phone_number") and not profile.user.phone_number:
                profile.user.phone_number = extracted_phone
                profile.user.save(update_fields=["phone_number"])

        # Education: Institution / University
        education_data = data.get("education") or {}
        extracted_institution = education_data.get("institution")
        if extracted_institution and not profile.university:
            profile.university = extracted_institution
            profile_fields_to_update.append("university")

        # Education: Field of study
        extracted_field = education_data.get("field_of_study")
        if extracted_field and not profile.field_of_study:
            canonical_field = extracted_field.lower().replace(" ", "_")
            valid_codes = [c[0] for c in profile.FIELD_OF_STUDY_CHOICES]
            if canonical_field in valid_codes:
                profile.field_of_study = canonical_field
            else:
                profile.field_of_study = extracted_field
            profile_fields_to_update.append("field_of_study")

        # Also populate academic profile in accounts if present
        try:
            from apps.accounts.models import StudentProfile as AccountStudentProfile
            account_profile = AccountStudentProfile.objects.filter(user=profile.user).first()
            if account_profile:
                acc_updates = []
                if data.get("gpa") is not None and not account_profile.gpa:
                    account_profile.gpa = data["gpa"]
                    acc_updates.append("gpa")
                if data.get("github_url") and not account_profile.github_url:
                    account_profile.github_url = data["github_url"]
                    acc_updates.append("github_url")
                if extracted_institution and not account_profile.university_name:
                    account_profile.university_name = extracted_institution
                    acc_updates.append("university_name")
                if extracted_field and not account_profile.department:
                    account_profile.department = extracted_field
                    acc_updates.append("department")
                if acc_updates:
                    account_profile.save(update_fields=acc_updates)
        except Exception as e:
            logger.warning(f"Could not update accounts.StudentProfile: {e}")

        # Sync Skills
        extracted_skills = data.get("skills", [])
        if extracted_skills:
            sync_cv_skills_to_profile(profile, extracted_skills, source="resume")
            logger.info(f"Synced {len(extracted_skills)} skills to student profile {profile.id}")

        if profile_fields_to_update:
            profile_fields_to_update.append("updated_at")
            profile.save(update_fields=profile_fields_to_update)
            logger.info(f"Updated profile {profile.id} fields: {profile_fields_to_update}")

        # Regenerate student vector embedding inline
        try:
            regenerate_student_embedding(profile)
            logger.info(f"Student embedding regenerated for profile {profile.id}")
        except Exception as exc:
            logger.warning(f"Could not regenerate embedding for profile {profile.id}: {exc}")

        # Invalidate recommendation cache
        try:
            from apps.recommendations.views import bust_recommendation_cache
            bust_recommendation_cache(profile.user_id)
            logger.info(f"Recommendation cache invalidated for user {profile.user_id}")
        except Exception as exc:
            logger.warning(f"Could not bust recommendation cache for user {profile.user_id}: {exc}")

    return {
        "status": "completed",
        "resume_id": resume_id,
        "parsed_data": data,
    }

