import logging

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from rest_framework.generics import GenericAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from apps.internships.models import Internship
from apps.students.models import StudentCV, StudentProfile, CV as CVModel

from .models import Recommendation
from .pagination import RecommendationPagination
from .serializers import RecommendationSerializer, RecommendationFeedbackSerializer
from .services.recommendation_engine_v2 import (
    generate_recommendations,
    has_recommendation_preferences,
)
from apps.students.services.profile_completion import compute_profile_completion
from apps.internships.serializers import InternshipSerializer

logger = logging.getLogger(__name__)

User = get_user_model()

# Cache TTL: 30 minutes. Busted immediately whenever profile/skills/prefs change.
RECOMMENDATION_CACHE_TTL = 60 * 30


def get_recommendation_cache_key(user_id: int) -> str:
    return f"recommendations:v2:user:{user_id}"


def bust_recommendation_cache(user_id: int) -> None:
    """Delete cached recommendations for a user and queue background match recalculation."""
    try:
        cache.delete(get_recommendation_cache_key(user_id))
    except Exception as e:
        logger.warning(f"Failed to clear recommendation cache for user {user_id}: {e}")

    try:
        from apps.students.models import StudentProfile
        profile = StudentProfile.objects.filter(user_id=user_id).first()
        if profile:
            try:
                from apps.recommendations.tasks import recalculate_student_matches_task
                recalculate_student_matches_task.delay(profile.id)
            except Exception as task_exc:
                logger.debug(f"Could not queue recalculate_student_matches_task for user {user_id}: {task_exc}")
    except Exception as e:
        logger.warning(f"Could not dispatch match recalculation on cache bust for user {user_id}: {e}")


class StudentRecommendationView(APIView):
    """
    Return AI-powered, personalised internship recommendations for the
    authenticated student.

    Scoring breakdown (all components 0–100, weighted to a single score):
      • Semantic  40% — embedding cosine similarity of profile+CV vs internship
      • Skills    25% — overlap between student skills (profile + CV) and required skills
      • Preference 20% — work-mode, location, and salary preference match
      • Location  10% — city / country / remote / preferred-location match
      • Salary     5% — compensation type + range alignment

    The cache is busted automatically whenever the student updates their
    profile, skills, preferences, or uploads a CV.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Recommendations"],
        operation_id="student_recommendations",
        summary="Get Personalised Recommendations",
        description=(
            "Returns a paginated, ranked list of internship recommendations "
            "based on the student's latest profile, skills, preferences, and CV.\n\n"
            "Add `?refresh=true` to force re-scoring even if a cache exists."
        ),
        parameters=[
            OpenApiParameter(
                name="refresh",
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description="Set to true to bust the cache and re-score immediately.",
                required=False,
            )
        ],
        responses={
            200: {
                "type": "object",
                "properties": {
                    "count":    {"type": "integer"},
                    "next":     {"type": "string",  "nullable": True},
                    "previous": {"type": "string",  "nullable": True},
                    "results": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "internship":  {"type": "object"},
                                "match_score": {"type": "number",
                                                "description": "Final weighted score 0–100"},
                                "score_breakdown": {
                                    "type": "object",
                                    "properties": {
                                        "semantic_score":   {"type": "number",
                                                             "description": "0–100 (weight 40%)"},
                                        "skill_score":      {"type": "number",
                                                             "description": "0–100 (weight 25%)"},
                                        "preference_score": {"type": "number",
                                                             "description": "0–100 (weight 20%)"},
                                        "location_score":   {"type": "number",
                                                             "description": "0–100 (weight 10%)"},
                                        "salary_score":     {"type": "number",
                                                             "description": "0–100 (weight 5%)"},
                                        "weights":          {"type": "object"},
                                    },
                                },
                                "explanation": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                    },
                    "cv_analysis":       {"type": "object"},
                    "profile_summary":   {"type": "object"},
                    "scoring_metadata":  {"type": "object"},
                },
            }
        },
    )
    def get(self, request):
        if str(request.user.role).lower() != "student":
            raise PermissionDenied(
                "Only students can receive recommendations.")

        cache_key = get_recommendation_cache_key(request.user.id)
        force_refresh = request.query_params.get(
            "refresh", "false").lower() == "true"

        # ----------------------------------------------------------
        # Always bust if ?refresh=true
        # ----------------------------------------------------------
        if force_refresh:
            cache.delete(cache_key)

        # ----------------------------------------------------------
        # Fetch fresh profile from DB — never use the ORM-cached obj
        # ----------------------------------------------------------
        try:
            profile = (
                StudentProfile.objects
                .prefetch_related("skills")
                .select_related("user")
                .get(user=request.user)
            )
        except StudentProfile.DoesNotExist:
            profile, _ = StudentProfile.objects.get_or_create(
                user=request.user)
            profile = (
                StudentProfile.objects
                .prefetch_related("skills")
                .get(pk=profile.pk)
            )

        cv_data = _build_cv_data(request.user)
        prof_summary = _build_profile_summary(profile)
        completion = compute_profile_completion(profile)

        # Profile must be 100% complete to generate personalized AI recommendations
        if completion.get("percent", 0) < 100:
            paginator = RecommendationPagination()
            paginator.paginate_queryset([], request)
            response_data = paginator.get_paginated_response([])
            response_data.data["profile_completed"] = False
            response_data.data["completion"] = completion
            response_data.data["message"] = (
                "Profile must be 100% complete to generate personalized AI recommendations."
            )
            response_data.data["cv_analysis"] = cv_data
            response_data.data["profile_summary"] = prof_summary
            response_data.data["scoring_metadata"] = {
                "profile_completed": False,
                "completion_percent": completion.get("percent", 0),
            }
            return response_data

        # ----------------------------------------------------------
        # Try cache
        # ----------------------------------------------------------
        cached = cache.get(cache_key)

        if cached is not None:
            recommendations = cached
            from_cache = True
        else:
            active_internships = (
                Internship.objects
                .filter(status="active", is_verified=True, needs_review=False, is_published=True)
                .prefetch_related("required_skills")
                .order_by("-created_at")
            )
            raw_results = generate_recommendations(
                request.user, active_internships, save_to_db=True
            )

            # Serialise to plain dicts (ORM objects are not cacheable)
            recommendations = [
                {
                    "internship":     item.internship,
                    "score":          item.score,
                    "explanation":    item.explanation,
                    "score_breakdown": item.score_breakdown,
                }
                for item in raw_results
            ]

            cache.set(cache_key, recommendations,
                      timeout=RECOMMENDATION_CACHE_TTL)
            from_cache = False

        # ----------------------------------------------------------
        # Paginate
        # ----------------------------------------------------------
        paginator = RecommendationPagination()
        page = paginator.paginate_queryset(recommendations, request)

        results = []
        for item in page:
            if isinstance(item, dict):
                internship = item["internship"]
                score = item["score"]
                explanation = item["explanation"]
                score_breakdown = item.get("score_breakdown", {})
            else:
                internship = item.internship
                score = item.score
                explanation = item.explanation
                score_breakdown = getattr(item, "score_breakdown", {})

            results.append({
                "internship":     InternshipSerializer(internship).data,
                "match_score":    score,
                "score_breakdown": score_breakdown,
                "explanation":    explanation,
            })

        response_data = paginator.get_paginated_response(results)

        # Attach extra context
        response_data.data["profile_completed"] = True
        response_data.data["completion"] = completion
        response_data.data["cv_analysis"] = cv_data
        response_data.data["profile_summary"] = prof_summary
        response_data.data["scoring_metadata"] = {
            "profile_completed": True,
            "completion_percent": completion.get("percent", 100),
            "from_cache":  from_cache,
            "cache_ttl_seconds": RECOMMENDATION_CACHE_TTL,
            "weights": {
                "semantic":   "40%",
                "skills":     "25%",
                "preference": "20%",
                "location":   "10%",
                "salary":     "5%",
            },
        }

        return response_data


class RecommendationHistoryListView(ListAPIView):
    """
    List persisted recommendation history for the authenticated student.
    """

    serializer_class = RecommendationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = RecommendationPagination

    @extend_schema(
        tags=["Recommendations"],
        operation_id="recommendation_history",
        summary="Recommendation History",
        description=(
            "Retrieve every saved Recommendation row for the authenticated "
            "student, ordered newest first.  Includes the full score breakdown "
            "and all feedback timestamps."
        ),
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        if str(self.request.user.role).lower() != "student":
            return Recommendation.objects.none()

        return (
            Recommendation.objects
            .filter(student=self.request.user)
            .select_related("internship")
            .order_by("-recommendation_date")
        )


class RecommendationFeedbackView(GenericAPIView):
    """
    Update recommendation feedback (view / save / apply / ignore).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = RecommendationFeedbackSerializer

    @extend_schema(
        tags=["Recommendations"],
        operation_id="recommendation_feedback",
        summary="Recommendation Feedback",
        description=(
            "Mark a recommendation as viewed, saved, applied, or ignored. "
            "Tracks student behaviour for future ML personalisation."
        ),
    )
    def post(self, request, internship_id):
        if str(request.user.role).lower() != "student":
            raise PermissionDenied(
                "Only students can provide recommendation feedback.")

        try:
            recommendation = Recommendation.objects.get(
                student=request.user,
                internship_id=internship_id,
            )
        except Recommendation.DoesNotExist:
            return Response(
                {"detail": "Recommendation not found for this internship."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]

        if action == "view":
            recommendation.mark_viewed()
        elif action == "save":
            recommendation.mark_saved()
        elif action == "apply":
            recommendation.mark_applied()
        elif action == "ignore":
            recommendation.mark_ignored()

        return Response(
            {
                "message": f"Recommendation marked as {action}.",
                "status":  recommendation.status,
            },
            status=status.HTTP_200_OK,
        )


# --------------------------------------------------
# Private helpers
# --------------------------------------------------

def _get_latest_cv(user):
    """
    Return the best available CV record for `user`.
    Priority: newest completed CV model → any CV model → StudentCV fallback.
    """
    completed = (
        CVModel.objects
        .filter(student=user, processing_status=CVModel.STATUS_COMPLETED)
        .order_by("-created_at")
        .first()
    )
    if completed:
        return completed

    any_cv = (
        CVModel.objects
        .filter(student=user)
        .order_by("-created_at")
        .first()
    )
    if any_cv:
        return any_cv

    return StudentCV.objects.filter(student=user).first()


def _build_cv_data(user) -> dict:
    """
    Build the cv_analysis block for the recommendation response.
    Merges data from the async CV model and the legacy StudentCV model.
    """
    try:
        cv = _get_latest_cv(user)
        if not cv:
            return {"has_cv": False, "message": "No CV uploaded yet."}

        # Determine processing status (CV model has it; StudentCV does not)
        proc_status = getattr(cv, "processing_status", "COMPLETED")
        if proc_status not in ("COMPLETED",):
            return {
                "has_cv": True,
                "processing_status": proc_status,
                "message": "CV is still being processed. Check back shortly.",
            }

        return {
            "has_cv":                  True,
            "processing_status":       proc_status,
            "extracted_skills":        getattr(cv, "extracted_skills",        []) or [],
            "extracted_education":     getattr(cv, "extracted_education",     []) or [],
            "extracted_experience":    getattr(cv, "extracted_experience",    []) or [],
            "extracted_projects":      getattr(cv, "extracted_projects",      []) or [],
            "extracted_certifications": getattr(cv, "extracted_certifications", []) or [],
            "uploaded_at": (
                getattr(cv, "uploaded_at",  None) or
                getattr(cv, "created_at",   None)
            ),
        }
    except (AttributeError, ValueError) as exc:
        logger.warning(f"Could not build CV data for user {user.id}: {exc}")
        return {"has_cv": False, "message": "CV data temporarily unavailable."}


def _build_profile_summary(profile) -> dict:
    """
    Summarise the profile fields that influence scoring so the caller can
    verify what data was actually used.
    """
    skills = list(profile.skills.values_list("name", flat=True))
    return {
        "skills":                  skills,
        "internship_type":         profile.internship_type,
        "work_type":               profile.work_type,
        "compensation_preference": profile.compensation_preference,
        "country":                 profile.country,
        "city":                    profile.city,
        "preferred_locations":     profile.preferred_locations or [],
        "willing_to_relocate":     profile.willing_to_relocate,
        "has_embedding":           bool(profile.embedding),
        "field_of_study":          profile.field_of_study,
        "education_level":         profile.education_level,
    }
