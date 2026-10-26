import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=2,
)
def refresh_student_recommendations(self, user_id):
    """
    Refresh recommendations for a specific student in the background.
    Clears the cached recommendations so the next request re-generates them.
    """
    logger.info(f"Starting recommendation refresh for user ID: {user_id}")

    try:
        from django.contrib.auth import get_user_model
        from django.core.cache import cache

        User = get_user_model()
        user = User.objects.get(id=user_id)

        # Invalidate cached recommendations so next request re-generates them
        cache_key = f"recommendations:user:{user.id}"
        cache.delete(cache_key)

        logger.info(
            f"Recommendation cache cleared for user {user_id} "
            f"({user.email}). Fresh results will be generated on next request."
        )

        return {
            "user_id": user.id,
            "status": "completed",
            "message": "Recommendation cache cleared successfully.",
        }

    except Exception as exc:
        logger.error(
            f"Recommendation refresh failed for user {user_id}: {exc}",
            exc_info=True,
        )

        if self.request.retries >= self.max_retries:
            logger.error(
                f"Recommendation refresh failed after {self.max_retries} retries"
            )
            raise

        logger.warning(
            f"Retrying recommendation refresh, "
            f"attempt {self.request.retries + 1}/{self.max_retries}"
        )
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))


@shared_task(
    bind=True,
    max_retries=2,
)
def generate_recommendations_for_user(self, user_id):
    """
    Generate AI-powered recommendations for a specific student.
    This task is triggered when a profile reaches 100% completion.
    """
    logger.info(f"Generating recommendations for user ID: {user_id}")

    try:
        from django.contrib.auth import get_user_model
        from django.core.cache import cache
        from apps.internships.models import Internship
        from apps.students.models import StudentProfile
        from .services.recommendation_engine_v2 import generate_recommendations

        User = get_user_model()
        user = User.objects.get(id=user_id)

        if str(user.role).lower() != "student":
            logger.warning(f"User {user_id} is not a student, skipping recommendations")
            return {"user_id": user_id, "status": "skipped", "reason": "not_student"}

        profile = StudentProfile.objects.filter(user=user).first()
        if not profile:
            logger.warning(f"No profile found for user {user_id}")
            return {"user_id": user_id, "status": "skipped", "reason": "no_profile"}

        # Get active internships
        active_internships = (
            Internship.objects
            .filter(status="active", is_verified=True, needs_review=False)
            .order_by("-created_at")
        )

        # Generate recommendations
        recommendations = generate_recommendations(
            user, active_internships, save_to_db=True
        )

        # Clear cache so next request uses fresh recommendations
        cache_key = f"recommendations:v2:user:{user_id}"
        cache.delete(cache_key)

        logger.info(
            f"Generated {len(recommendations)} recommendations for user {user_id}"
        )

        return {
            "user_id": user_id,
            "status": "completed",
            "recommendations_count": len(recommendations),
        }

    except Exception as exc:
        logger.error(
            f"Recommendation generation failed for user {user_id}: {exc}",
            exc_info=True,
        )

        if self.request.retries >= self.max_retries:
            logger.error(
                f"Recommendation generation failed after {self.max_retries} retries"
            )
            raise

        logger.warning(
            f"Retrying recommendation generation, "
            f"attempt {self.request.retries + 1}/{self.max_retries}"
        )
        raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))


@shared_task(
    bind=True,
    max_retries=3,
)
def recalculate_student_matches_task(self, student_id: int, top_n: int = 50):
    """
    Enqueued whenever a student profile changes (Task 2.1).
    Calculates hybrid 6-factor scores + pgvector embeddings for candidate
    internships and persists top-N matches to the Recommendation table.
    """
    logger.info(f"Starting match recalculation for student ID: {student_id}")

    try:
        from django.contrib.auth import get_user_model
        from django.core.cache import cache
        from apps.students.models import StudentProfile
        from apps.recommendations.models import Recommendation
        from ai_engine.services.matcher import get_ranked_recommendations

        User = get_user_model()
        profile = None

        # Check if student_id is StudentProfile PK or User PK
        profile = (
            StudentProfile.objects.filter(id=student_id)
            .select_related("user")
            .prefetch_related("skills", "interests")
            .first()
        )
        if not profile:
            profile = (
                StudentProfile.objects.filter(user_id=student_id)
                .select_related("user")
                .prefetch_related("skills", "interests")
                .first()
            )

        if not profile:
            logger.warning(f"StudentProfile not found for ID {student_id}, skipping recalculation")
            return {"student_id": student_id, "status": "skipped", "reason": "profile_not_found"}

        user = profile.user

        # Run 6-factor hybrid matcher with pgvector acceleration
        ranked_matches = get_ranked_recommendations(profile, top_n=top_n)

        # Persist top-N matches to the database
        created_count = 0
        updated_count = 0
        for match in ranked_matches:
            breakdown = match["breakdown"]
            _, created = Recommendation.upsert_recommendation(
                student=user,
                internship=match["internship"],
                overall_score=match["score"],
                semantic_score=breakdown["semantic_score"],
                skill_score=breakdown["skill_score"],
                education_score=breakdown["education_score"],
                interest_score=breakdown["interest_score"],
                experience_score=breakdown["experience_score"],
                location_score=breakdown["location_score"],
                work_mode_score=breakdown["work_mode_score"],
                explanation=breakdown["explanation"],
                status=Recommendation.STATUS_RECOMMENDED,
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        # Clear recommendations cache
        cache.delete(f"recommendations:v2:user:{user.id}")
        cache.delete(f"recommendations:user:{user.id}")

        logger.info(
            f"Successfully recalculated matches for student {user.email}: "
            f"{created_count} created, {updated_count} updated."
        )

        return {
            "student_id": student_id,
            "user_id": user.id,
            "status": "completed",
            "matches_count": len(ranked_matches),
            "created": created_count,
            "updated": updated_count,
        }

    except Exception as exc:
        logger.error(
            f"Match recalculation failed for student {student_id}: {exc}",
            exc_info=True,
        )
        if self.request.retries >= self.max_retries:
            logger.error(f"Match recalculation exceeded max retries for student {student_id}")
            raise
        raise self.retry(exc=exc, countdown=15 * (self.request.retries + 1))

