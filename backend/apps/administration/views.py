from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.db.models import Avg, Case, CharField, Count, Q, Value, When
from django.db.models.functions import TruncDay
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, OpenApiExample

from apps.internships.permissions import IsAdminRole
from apps.applications.models import ApplicationHistory
from apps.internships.models import (
    SavedInternship,
    InternshipApplication,
    Internship,
    InternshipSkill,
)
from apps.recommendations.models import Recommendation
from .models import StudentActivityLog
from .serializers import (
    AdminStudentListSerializer,
    AdminStudentActionSerializer,
)

User = get_user_model()


class AdminStudentPagination(PageNumberPagination):
    """
    Pagination for admin student listings.
    Follows the same conventions as other admin endpoints.
    """

    page_size = 20
    max_page_size = 100
    page_size_query_param = "page_size"


@extend_schema(tags=["Admin Students"])
class AdminStudentListView(generics.ListAPIView):
    """
    List all student accounts for administrators.

    ``GET /api/admin/students/``

    Returns paginated student data including account status,
    profile information, and activity counts.
    Only accessible by authenticated administrators.
    """

    serializer_class = AdminStudentListSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    pagination_class = AdminStudentPagination
    filter_backends = [SearchFilter, OrderingFilter, DjangoFilterBackend]
    search_fields = [
        "email",
        "username",
        "first_name",
        "last_name",
    ]
    ordering_fields = [
        "date_joined",
        "last_login",
        "email",
        "first_name",
        "last_name",
        "is_active",
    ]
    ordering = ["-date_joined"]

    def get_queryset(self):
        qs = User.objects.filter(
            role=User.Role.STUDENT,
        ).select_related("student_profile")

        # Filter by active status if provided
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        # Filter by email verified status if provided
        is_verified = self.request.query_params.get("is_email_verified")
        if is_verified is not None:
            if is_verified.lower() in ("true", "1"):
                qs = qs.filter(is_email_verified=True)
            elif is_verified.lower() in ("false", "0"):
                qs = qs.filter(is_email_verified=False)

        return qs


@extend_schema(tags=["Admin Students"])
class AdminStudentDeactivateView(APIView):
    """
    Deactivate a student account.

    ``POST /api/admin/students/<id>/deactivate/``

    Sets ``is_active=False`` on the student's User record.
    The student will be blocked from their next login attempt,
    returning the same 403 behavior defined in Phase 2.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminStudentActionSerializer

    def post(self, request, pk):
        try:
            student = User.objects.get(pk=pk, role=User.Role.STUDENT)
        except (User.DoesNotExist, ValueError, ValidationError):
            return Response(
                {
                    "detail": "Student not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not student.is_active:
            return Response(
                {
                    "detail": "Student account is already inactive.",
                    "student_id": str(student.id),
                    "is_active": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        student.is_active = False
        student.save(update_fields=["is_active", "updated_at"])

        StudentActivityLog.objects.create(
            student=student,
            action="account_deactivated",
            description=(
                f"Account deactivated by administrator "
                f"{request.user.email}."
            ),
            metadata={
                "admin_id": str(request.user.id),
                "admin_email": request.user.email,
            },
        )

        serializer = AdminStudentActionSerializer(
            data={
                "message": "Student account deactivated successfully.",
                "student_id": str(student.id),
                "is_active": False,
            }
        )
        serializer.is_valid()

        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin Students"])
class AdminStudentActivateView(APIView):
    """
    Activate a student account.

    ``POST /api/admin/students/<id>/activate/``

    Sets ``is_active=True`` on the student's User record.
    The student will be able to log in again.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminStudentActionSerializer

    def post(self, request, pk):
        try:
            student = User.objects.get(pk=pk, role=User.Role.STUDENT)
        except (User.DoesNotExist, ValueError, ValidationError):
            return Response(
                {
                    "detail": "Student not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if student.is_active:
            return Response(
                {
                    "detail": "Student account is already active.",
                    "student_id": str(student.id),
                    "is_active": True,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        student.is_active = True
        student.save(update_fields=["is_active", "updated_at"])

        StudentActivityLog.objects.create(
            student=student,
            action="account_activated",
            description=(
                f"Account activated by administrator "
                f"{request.user.email}."
            ),
            metadata={
                "admin_id": str(request.user.id),
                "admin_email": request.user.email,
            },
        )

        serializer = AdminStudentActionSerializer(
            data={
                "message": "Student account activated successfully.",
                "student_id": str(student.id),
                "is_active": True,
            }
        )
        serializer.is_valid()

        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin Students"])
class AdminStudentActivityView(generics.ListAPIView):
    """
    View student activity for a specific student.

    ``GET /api/admin/students/<id>/activity/``

    Aggregates activity from multiple sources:
    - Profile updates
    - Resume uploads
    - Internship saves
    - Internship applications
    - Recommendation interactions
    - Account status changes
    Only accessible by authenticated administrators.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    pagination_class = AdminStudentPagination

    def get_serializer_class(self):
        from .serializers import get_student_activity_serializer
        return get_student_activity_serializer()

    def _get_student_or_404(self, pk):
        try:
            return User.objects.get(pk=pk, role=User.Role.STUDENT)
        except (User.DoesNotExist, Exception):
            return None

    def get_queryset(self):
        student_id = self.kwargs.get("pk")
        student = self._get_student_or_404(student_id)

        if student is None:
            return StudentActivityLog.objects.none()

        logs = StudentActivityLog.objects.filter(
            student=student,
        )

        # Filter by action type if provided
        action = self.request.query_params.get("action")
        if action:
            logs = logs.filter(action=action)

        return logs

    def list(self, request, *args, **kwargs):
        student_id = self.kwargs.get("pk")
        student = self._get_student_or_404(student_id)
        if student is None:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        logs = self.get_queryset()

        from apps.students.models import StudentProfile
        profile = StudentProfile.objects.filter(user=student).first()

        base_response = {
            "student": {
                "id": student.id,
                "email": student.email,
                "full_name": " ".join(
                    filter(
                        None,
                        [student.first_name, student.last_name],
                    )
                ),
                "is_active": student.is_active,
                "date_joined": student.date_joined,
                "last_login": student.last_login,
            },
            "profile_summary": {
                "education_level": (
                    profile.education_level if profile else None
                ),
                "university": (
                    profile.university if profile else None
                ),
                "field_of_study": (
                    profile.field_of_study if profile else None
                ),
                "skills_count": (
                    profile.skills.count() if profile else 0
                ),
            },
            "activity_counts": {
                "total_applications": (
                    student.internship_applications.count()
                ),
                "total_saves": (
                    student.saved_internships.count()
                ),
                "total_recommendations": (
                    student.recommendations.count()
                ),
                "total_application_clicks": (
                    student.application_histories.count()
                ),
                "total_activity_logs": logs.count(),
            },
        }

        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            base_response["count"] = (
                self.paginator.page.paginator.count
            )
            base_response["next"] = (
                self.paginator.get_next_link()
            )
            base_response["previous"] = (
                self.paginator.get_previous_link()
            )
            base_response["results"] = serializer.data
            return Response(base_response, status=status.HTTP_200_OK)

        serializer = self.get_serializer(logs, many=True)
        base_response["results"] = serializer.data
        return Response(base_response, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin Analytics"])
class AdminRecommendationAnalyticsView(APIView):
    """Report aggregate statistics from persisted recommendations."""

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        recommendations = Recommendation.objects.filter(
            overall_score__isnull=False,
        )
        timezone_info = timezone.get_current_timezone()

        daily_rows = (
            recommendations
            .annotate(day=TruncDay("recommendation_date", tzinfo=timezone_info))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )

        score_distribution = (
            recommendations
            .annotate(
                bucket=Case(
                    When(overall_score__lt=20, then=Value("0-19")),
                    When(overall_score__lt=40, then=Value("20-39")),
                    When(overall_score__lt=60, then=Value("40-59")),
                    When(overall_score__lt=80, then=Value("60-79")),
                    When(overall_score__lte=100, then=Value("80-100")),
                    output_field=CharField(),
                ),
            )
            .values("bucket")
            .annotate(count=Count("id"))
        )
        bucket_counts = {
            row["bucket"]: row["count"] for row in score_distribution
        }
        buckets = ["0-19", "20-39", "40-59", "60-79", "80-100"]

        average = recommendations.aggregate(
            average=Avg("overall_score"),
        )["average"]

        return Response(
            {
                "recommendations_per_day": [
                    {
                        "date": row["day"].date().isoformat(),
                        "count": row["count"],
                    }
                    for row in daily_rows
                ],
                "average_match_score": (
                    float(average) if average is not None else None
                ),
                "score_distribution": [
                    {
                        "range": bucket,
                        "count": bucket_counts.get(bucket, 0),
                    }
                    for bucket in buckets
                ],
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Admin Analytics"])
class AdminAnalyticsView(APIView):
    """Return database-backed aggregates for the administrator dashboard."""

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        recommendations = Recommendation.objects.filter(
            overall_score__isnull=False,
        )
        average_score = recommendations.aggregate(
            average=Avg("overall_score"),
        )["average"]
        skill_rows = (
            InternshipSkill.objects
            .values("skill__name")
            .annotate(count=Count("id"))
            .order_by("-count", "skill__name")[:10]
        )

        return Response(
            {
                "users": {
                    "total": User.objects.count(),
                    "students": User.objects.filter(
                        role=User.Role.STUDENT,
                    ).count(),
                    "admins": User.objects.filter(
                        role=User.Role.ADMIN,
                    ).count(),
                },
                "internships": {
                    "total": Internship.objects.count(),
                    "active": Internship.objects.filter(
                        status=Internship.STATUS_ACTIVE,
                    ).count(),
                    "needs_review": Internship.objects.filter(
                        needs_review=True,
                    ).count(),
                },
                "most_requested_skills": [
                    {
                        "skill": row["skill__name"],
                        "count": row["count"],
                    }
                    for row in skill_rows
                ],
                "recommendations": {
                    "total": recommendations.count(),
                    "average_match_score": (
                        float(average_score)
                        if average_score is not None
                        else None
                    ),
                },
            },
            status=status.HTTP_200_OK,
        )
