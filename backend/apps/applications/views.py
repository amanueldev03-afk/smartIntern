from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from drf_spectacular.utils import extend_schema, OpenApiExample, OpenApiResponse

from apps.internships.models import Internship, InternshipApplication
from .models import ApplicationHistory
from .serializers import ApplicationHistorySerializer
from apps.recommendations.pagination import RecommendationPagination


class ApplicationHistoryListView(ListAPIView):
    """List the authenticated student's application-click history."""

    serializer_class = ApplicationHistorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = RecommendationPagination

    def get_queryset(self):
        user_role = str(getattr(self.request.user, "role", "")).upper()
        if user_role != "STUDENT":
            return ApplicationHistory.objects.none()

        return (
            ApplicationHistory.objects
            .filter(student=self.request.user, clicked_apply=True)
            .select_related("internship")
            .order_by("-applied_date", "-id")
        )


class TrackApplicationView(APIView):
    """
    POST /api/applications/track/
    Record that an authenticated student clicked Apply on an internship.
    Creates or updates an ApplicationHistory record with clicked_apply=True.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Applications"],
        summary="Track Application Click",
        description="Record that a student clicked Apply on an internship listing",
        request={"application/json": {"type": "object",
                                      "properties": {"internship": {"type": "integer"}}}},
        responses={
            200: OpenApiResponse(description="Application tracked successfully"),
            201: OpenApiResponse(description="Application track record created"),
            400: OpenApiResponse(description="Bad request"),
            403: OpenApiResponse(description="Permission denied"),
            404: OpenApiResponse(description="Internship not found"),
        },
        examples=[
            OpenApiExample("Track Application", value={"internship": 1})
        ],
    )
    def post(self, request, *args, **kwargs):
        user_role = str(getattr(request.user, "role", "")).upper()
        if user_role != "STUDENT":
            raise PermissionDenied("Only students can track applications.")

        internship_id = request.data.get(
            "internship") or request.data.get("internship_id")
        if not internship_id:
            raise ValidationError({"internship": "Internship ID is required."})

        try:
            internship = Internship.objects.get(pk=internship_id)
        except (Internship.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": "Internship not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Create or update ApplicationHistory
        history, created = ApplicationHistory.objects.update_or_create(
            student=request.user,
            internship=internship,
            defaults={
                "clicked_apply": True,
                "applied_date": timezone.now(),
            },
        )

        # Sync InternshipApplication model if not already tracked
        try:
            InternshipApplication.objects.get_or_create(
                student=request.user,
                internship=internship,
                defaults={"status": InternshipApplication.STATUS_APPLIED},
            )
        except Exception:
            pass

        # Sync recommendation status if recommendation exists
        try:
            from apps.recommendations.models import Recommendation
            rec = Recommendation.objects.filter(
                student=request.user,
                internship=internship,
            ).first()
            if rec:
                rec.mark_applied()
        except Exception:
            pass

        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {
                "message": "Application tracked successfully.",
                "clicked_apply": history.clicked_apply,
                "internship_id": internship.id,
                "applied_date": history.applied_date.isoformat(),
            },
            status=status_code,
        )
