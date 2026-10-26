import logging
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from apps.recommendations.pagination import RecommendationPagination
from apps.postings.services.matcher import get_posting_recommendations_for_student
from apps.postings.serializers import (
    InternshipPostingSerializer,
    PostingRecommendationSerializer,
)

logger = logging.getLogger(__name__)


class PostingRecommendationView(APIView):
    """
    Return AI-powered, multi-track institutional InternshipPosting recommendations
    for the authenticated student.

    Uses the 6-factor weighted recommendation algorithm as the base score, enhanced
    with pgvector-based dense cosine semantic tie-breaking and explainable AI bullets.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Postings Recommendations"],
        operation_id="posting_recommendations",
        summary="Get Institutional Posting Recommendations",
        description=(
            "Returns ranked InternshipPosting recommendations (CAMPUS, COMPANY, DIRECT) "
            "matching the existing recommendation response shape, with added 'track' and 'posting_id'."
        ),
        parameters=[
            OpenApiParameter(
                name="page",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description="A page number within the paginated result set.",
                required=False,
            ),
            OpenApiParameter(
                name="page_size",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description="Number of results to return per page.",
                required=False,
            ),
        ],
        responses={200: PostingRecommendationSerializer(many=True)},
    )
    def get(self, request):
        role_str = str(getattr(request.user, "role", "")).lower()
        if role_str != "student":
            raise PermissionDenied("Only students can receive internship posting recommendations.")

        # Compute recommendations using the 6-factor engine + semantic tiebreaker
        scored_postings = get_posting_recommendations_for_student(request.user, limit=100)

        # Format items to conform to the canonical recommendation item shape
        formatted_items = []
        for item in scored_postings:
            posting = item["posting"]
            formatted_items.append({
                "internship": InternshipPostingSerializer(posting).data,
                "match_score": item["match_score"],
                "score_breakdown": item["score_breakdown"],
                "explanation": item["explanation"],
                "track": item["track"],
                "posting_id": item["posting_id"],
            })

        # Paginate with RecommendationPagination (page_size=10)
        paginator = RecommendationPagination()
        page = paginator.paginate_queryset(formatted_items, request)
        response = paginator.get_paginated_response(page)

        # Attach metadata to match canonical /api/recommendations/ response shape
        response.data["profile_completed"] = True
        response.data["scoring_metadata"] = {
            "engine": "6-Factor Weighted with pgvector Semantic Boost",
            "weights": {
                "skill_score": 0.40,
                "education_score": 0.20,
                "interest_score": 0.15,
                "experience_score": 0.10,
                "location_score": 0.10,
                "work_mode_score": 0.05,
            },
            "semantic_tiebreaker_applied": True,
            "total_evaluated": len(scored_postings),
        }
        return response
