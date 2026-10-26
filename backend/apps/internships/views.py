from django.contrib.postgres.search import SearchQuery, SearchVector
from django.db import transaction
from django.db.models import Q, Count, OuterRef, Subquery
from django.utils import timezone
from rest_framework import generics, status, serializers
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.generics import GenericAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample, OpenApiResponse
from drf_spectacular.types import OpenApiTypes
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from django.core.cache import cache
from apps.students.models import StudentCV, StudentProfile
from .tasks import (
    collect_internships_from_source,
    generate_internship_embedding_task,
    validate_listing_urls_task,
)
from .pagination import (
    RecommendationPagination,
)

from .models import (
    Internship,
    InternshipSource,
    InternshipCollectionLog,
    InternshipDuplicateFlag,
    SavedInternship,
    InternshipApplication,
    Skill,
)
from .serializers import (
    InternshipSerializer,
    InternshipSourceSerializer,
    InternshipCollectionLogSerializer,
    SavedInternshipSerializer,
    InternshipApplicationSerializer,
    InternshipVerificationSerializer,
    SkillSerializer,
    AdminRecentInternshipSerializer,
    AdminCollectionLogSerializer,
    AdminInternshipReviewSerializer,
    DataSourceHealthSerializer,
)
from .filters import InternshipFilter
from .permissions import IsAdminRole, IsStudent
from .services.collector import collect_source
from apps.administration.services import log_student_activity


User = get_user_model()


def is_student_user(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    role_str = str(getattr(user, "role", "")).upper()
    return role_str in (User.Role.STUDENT, "STUDENT")


class InternshipPagination(PageNumberPagination):
    """
    Custom pagination for internship listings.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class BurstRateThrottle(UserRateThrottle):
    """
    Rate limit for burst requests (short-term).
    """
    scope = 'burst'
    rate = '100/min'


class SustainedRateThrottle(UserRateThrottle):
    """
    Rate limit for sustained requests (long-term).
    """
    scope = 'sustained'
    rate = '1000/hour'


class InternshipListView(generics.ListAPIView):
    """
    List active and verified internships.
    """

    serializer_class = InternshipSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = InternshipPagination
    throttle_classes = [BurstRateThrottle, SustainedRateThrottle]

    @extend_schema(
        operation_id="internship_list",
        summary="List Active Internships",
        description="Retrieve a paginated list of active and verified internships with filtering, search, and ordering capabilities.",
        parameters=[
            OpenApiParameter(
                name="page",
                type=OpenApiTypes.INT,
                description="Page number",
                required=False,
            ),
            OpenApiParameter(
                name="page_size",
                type=OpenApiTypes.INT,
                description="Number of results per page (max 100)",
                required=False,
            ),
            OpenApiParameter(
                name="search",
                type=OpenApiTypes.STR,
                description="Search in title, organization, description, category, country, city",
                required=False,
            ),
            OpenApiParameter(
                name="ordering",
                type=OpenApiTypes.STR,
                description="Order by field (e.g., created_at, -created_at, minimum_compensation)",
                required=False,
            ),
            OpenApiParameter(
                name="category",
                type=OpenApiTypes.STR,
                description="Filter by internship category",
                required=False,
            ),
            OpenApiParameter(
                name="country",
                type=OpenApiTypes.STR,
                description="Filter by country",
                required=False,
            ),
            OpenApiParameter(
                name="internship_type",
                type=OpenApiTypes.STR,
                description="Filter by internship type (remote, onsite, hybrid)",
                required=False,
            ),
        ],
        tags=["Internships"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]

    filterset_class = InternshipFilter

    search_fields = [
        "title",
        "organization_name",
        "description",
        "category",
        "country",
        "city",
    ]

    ordering_fields = [
        "created_at",
        "posted_at",
        "application_deadline",
        "minimum_compensation",
        "maximum_compensation",
    ]

    ordering = [
        "-created_at",
    ]

    def get_queryset(self):

        now = timezone.now()
        queryset = (
            Internship.objects
            .filter(
                status=Internship.STATUS_ACTIVE,
                is_verified=True,
                needs_review=False,
                is_published=True,
            )
            .filter(
                Q(application_deadline__isnull=True)
                | Q(application_deadline__gt=now)
            )
            .select_related("source")
        )

        excluded_ids = {
            int(value)
            for value in (self.request.query_params.get("exclude_ids") or "").split(",")
            if value.strip().isdigit()
        }
        if excluded_ids:
            queryset = queryset.exclude(id__in=excluded_ids)

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            vector = SearchVector("title", weight="A") + \
                SearchVector("description", weight="B")
            queryset = queryset.annotate(
                search=vector).filter(search=SearchQuery(q))

        filterset = InternshipFilter(
            self.request.GET, queryset=queryset, request=self.request)
        return filterset.qs.order_by("-created_at")


class InternshipDetailView(generics.RetrieveAPIView):
    """
    Return a single active and verified internship.
    """

    serializer_class = InternshipSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [BurstRateThrottle, SustainedRateThrottle]

    @extend_schema(
        operation_id="internship_detail",
        summary="Get Internship Details",
        description="Get detailed information about a specific active and verified internship by ID.",
        tags=["Internships"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):

        now = timezone.now()

        return (
            Internship.objects
            .filter(
                status=Internship.STATUS_ACTIVE,
                is_verified=True,
                needs_review=False,
            )
            .filter(
                Q(application_deadline__isnull=True)
                | Q(application_deadline__gt=now)
            )
            .select_related("source")
            .order_by("-created_at")
        )


class AdminInternshipListCreateView(generics.ListCreateAPIView):
    """
    Admin endpoint for listing and creating internships.
    """

    serializer_class = InternshipSerializer
    permission_classes = [IsAdminRole]
    pagination_class = InternshipPagination
    throttle_classes = [BurstRateThrottle, SustainedRateThrottle]

    @extend_schema(
        operation_id="admin_internship_list",
        summary="Admin: List all internships",
        description="Retrieve a paginated list of all internships (including draft, expired, and unverified) with full filtering capabilities. Admin only.",
        tags=["Admin Internships"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        operation_id="admin_internship_create",
        summary="Admin: Create internship",
        description="Create a new internship. Admin only.",
        tags=["Admin Internships"],
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def perform_create(self, serializer):
        internship = serializer.save()

        # Queue embedding generation after transaction commits
        try:
            transaction.on_commit(
                lambda: generate_internship_embedding_task.delay(internship.id)
            )
        except (AttributeError, RuntimeError) as e:
            # Log error but don't fail the creation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to queue embedding generation: {e}")

        # Queue URL validation after transaction commits (Task 5.9)
        try:
            transaction.on_commit(
                lambda: validate_listing_urls_task.delay(internship.id)
            )
        except (AttributeError, RuntimeError) as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to queue URL validation: {e}")

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]

    filterset_class = InternshipFilter

    search_fields = [
        "title",
        "organization_name",
        "description",
        "category",
        "country",
        "city",
    ]

    ordering_fields = [
        "created_at",
        "posted_at",
        "application_deadline",
        "status",
        "is_verified",
    ]

    ordering = [
        "-created_at",
    ]

    def get_queryset(self):
        return (
            Internship.objects
            .select_related("source")
            .order_by("-created_at")
        )


class AdminInternshipDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Admin endpoint for viewing, updating, and deleting internships.
    """

    serializer_class = InternshipSerializer
    permission_classes = [IsAdminRole]
    queryset = Internship.objects.select_related("source")
    throttle_classes = [BurstRateThrottle, SustainedRateThrottle]

    @extend_schema(
        operation_id="admin_internship_detail",
        summary="Admin: Get internship details",
        description="Get detailed information about any internship by ID. Admin only.",
        tags=["Admin Internships"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        operation_id="admin_internship_update",
        summary="Admin: Update internship",
        description="Update an existing internship by ID. Admin only.",
        tags=["Admin Internships"],
    )
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)

    @extend_schema(
        operation_id="admin_internship_partial_update",
        summary="Admin: Partial update internship",
        description="Partially update an existing internship by ID. Admin only.",
        tags=["Admin Internships"],
    )
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    @extend_schema(
        operation_id="admin_internship_delete",
        summary="Admin: Delete internship",
        description="Delete an internship by ID. Admin only.",
        tags=["Admin Internships"],
    )
    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)

    def perform_update(self, serializer):
        previous_values = {
            field: getattr(serializer.instance, field)
            for field in (
                "title", "organization_name", "description",
                "application_url", "application_deadline",
            )
        }
        internship = serializer.save()

        if any(getattr(internship, field) != value for field, value in previous_values.items()):
            from apps.notifications.tasks import send_saved_internship_update_notifications
            transaction.on_commit(
                lambda internship_id=internship.id: send_saved_internship_update_notifications.delay(
                    internship_id
                )
            )

        # Queue embedding regeneration after transaction commits
        # This ensures embeddings stay in sync with internship data
        try:
            transaction.on_commit(
                lambda: generate_internship_embedding_task.delay(internship.id)
            )
        except (AttributeError, RuntimeError) as e:
            # Log error but don't fail the update
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Failed to queue internship embedding regeneration: {e}")

        # Queue URL validation after transaction commits (Task 5.9)
        try:
            transaction.on_commit(
                lambda: validate_listing_urls_task.delay(internship.id)
            )
        except (AttributeError, RuntimeError) as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Failed to queue URL validation: {e}")


class LatestInternshipListView(generics.ListAPIView):
    """
    Return the latest active and verified internships.
    """

    serializer_class = InternshipSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = InternshipPagination
    throttle_classes = [BurstRateThrottle, SustainedRateThrottle]

    @extend_schema(
        tags=["Internships"],
        summary="Get Latest Internships",
        description="Retrieve the latest 20 active and verified internships ordered by posting date.",
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        now = timezone.now()

        return (
            Internship.objects
            .filter(
                status="active",
                is_verified=True,
                needs_review=False,
            )
            .filter(
                Q(application_deadline__isnull=True)
                | Q(application_deadline__gt=now)
            )
            .select_related("source")
            .order_by("-posted_at", "-created_at")[:20]
        )


class AdminInternshipSourceListCreateView(
    generics.ListCreateAPIView
):
    """
    Admin can list and create internship sources.
    """

    queryset = InternshipSource.objects.all().order_by(
        "-created_at"
    )

    serializer_class = InternshipSourceSerializer

    permission_classes = [
        IsAdminRole,
    ]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Admin: List internship sources",
        description="Retrieve a list of all internship collection sources. Admin only.",
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        tags=["Admin Internships"],
        summary="Admin: Create internship source",
        description="Create a new internship collection source. Admin only.",
        request=InternshipSourceSerializer,
        responses={201: InternshipSourceSerializer},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class AdminInternshipSourceDetailView(
    generics.RetrieveUpdateDestroyAPIView
):
    """
    Admin can retrieve, update, and delete
    an internship source.
    """

    queryset = InternshipSource.objects.all()

    serializer_class = InternshipSourceSerializer

    permission_classes = [
        IsAdminRole,
    ]

    @extend_schema(tags=["Admin Internships"], summary="Admin: Get source details")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Update source", request=InternshipSourceSerializer, responses={200: InternshipSourceSerializer})
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Partial update source", request=InternshipSourceSerializer, responses={200: InternshipSourceSerializer})
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Delete source")
    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)


class AdminCollectionLogListView(
    generics.ListAPIView
):
    """
    Admin can view internship collection history.
    """

    queryset = (
        InternshipCollectionLog.objects
        .select_related("source")
        .all()
        .order_by("-started_at")
    )

    serializer_class = (
        InternshipCollectionLogSerializer
    )

    permission_classes = [
        IsAdminRole,
    ]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Admin: View collection logs",
        description="Retrieve logs of internship collection runs. Admin only.",
        responses={200: InternshipCollectionLogSerializer(many=True)}
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class AdminSourceCollectView(GenericAPIView):
    """
    Queue internship collection as a background task.
    """

    serializer_class = None

    permission_classes = [
        IsAdminRole,
    ]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Trigger Internship Collection",
        description="Trigger background internship collection task for a specific source by ID.",
        request=None,
        responses={
            202: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'},
                    'source': {'type': 'string'},
                    'task_id': {'type': 'string'},
                    'status': {'type': 'string'}
                }
            },
            503: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'},
                    'source': {'type': 'string'},
                    'status': {'type': 'string'}
                }
            }
        }
    )
    def post(self, request, pk):

        try:
            source = InternshipSource.objects.get(
                pk=pk
            )

        except InternshipSource.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Internship source not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not source.is_active:
            return Response(
                {
                    "detail": (
                        "This internship source "
                        "is inactive."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            task = collect_internships_from_source.delay(
                source.id
            )
        except (AttributeError, RuntimeError, ConnectionError) as e:
            # Log error but don't fail the request
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to queue collection task: {e}")
            return Response(
                {
                    "message": "Failed to start collection. Celery may not be available.",
                    "source": source.name,
                    "status": "failed",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "message": (
                    "Internship collection "
                    "started."
                ),
                "source": source.name,
                "task_id": task.id,
                "status": "queued",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class InternshipSaveUnsaveView(APIView):
    """
    POST /api/internships/<id>/save/  -> Save an internship for the authenticated student.
    DELETE /api/internships/<id>/save/ -> Remove the saved internship.
    """
    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(
        tags=["Internships"],
        summary="Save Internship",
        description="Save an internship to the authenticated student profile",
        responses={
            201: SavedInternshipSerializer,
            200: OpenApiResponse(description="Already saved"),
            400: OpenApiResponse(description="Bad request"),
            403: OpenApiResponse(description="Permission denied"),
            404: OpenApiResponse(description="Internship not found"),
        },
    )
    def post(self, request, pk=None):
        if not is_student_user(request.user):
            raise PermissionDenied("Only students can save internships.")

        try:
            internship = Internship.objects.get(pk=pk)
        except Internship.DoesNotExist:
            return Response(
                {"detail": "Internship not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if internship.status != Internship.STATUS_ACTIVE:
            return Response(
                {"detail": "This internship is not currently available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        saved_item, created = SavedInternship.objects.get_or_create(
            student=request.user,
            internship=internship,
        )

        try:
            from apps.recommendations.models import Recommendation
            rec = Recommendation.objects.filter(
                student=request.user,
                internship=internship,
            ).first()
            if rec:
                rec.mark_saved()
        except Exception:
            pass

        # Phase 9 — record a lightweight save in the activity log.
        if created and is_student_user(request.user):
            log_student_activity(
                student=request.user,
                action="internship_save",
                description=f"Saved internship '{internship.title}'.",
                metadata={"internship_id": internship.id},
            )

        serializer = SavedInternshipSerializer(saved_item)
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {
                "message": "Internship saved successfully.",
                "saved": True,
                "data": serializer.data,
            },
            status=status_code,
        )

    @extend_schema(
        tags=["Internships"],
        summary="Unsave Internship",
        description="Remove a saved internship from the student profile",
        responses={
            200: OpenApiResponse(description="Internship unsaved successfully"),
            403: OpenApiResponse(description="Permission denied"),
            404: OpenApiResponse(description="Internship not found"),
        },
    )
    def delete(self, request, pk=None):
        if not is_student_user(request.user):
            raise PermissionDenied(
                "Only students can save or unsave internships.")

        if not Internship.objects.filter(pk=pk).exists():
            return Response(
                {"detail": "Internship not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        SavedInternship.objects.filter(
            student=request.user,
            internship_id=pk,
        ).delete()

        return Response(
            {
                "message": "Internship removed from saved internships.",
                "saved": False,
                "internship_id": pk,
            },
            status=status.HTTP_200_OK,
        )


class StudentSaveInternshipView(
    generics.CreateAPIView
):
    """
    Save an internship for the authenticated student.
    """

    serializer_class = SavedInternshipSerializer

    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(
        tags=["Internships"],
        summary="Save Internship",
        description="Save an internship to student profile for later viewing",
        request=SavedInternshipSerializer,
        responses={201: SavedInternshipSerializer},
        examples=[OpenApiExample("Save Internship", value={"internship": 1})]
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def perform_create(self, serializer):

        if not is_student_user(self.request.user):
            raise PermissionDenied(
                "Only students can save internships."
            )

        internship = serializer.validated_data[
            "internship"
        ]

        if internship.status != "active":
            raise serializers.ValidationError(
                {
                    "internship": (
                        "This internship is not "
                        "currently available."
                    )
                }
            )

        try:
            serializer.save(
                student=self.request.user
            )

        except IntegrityError:
            raise serializers.ValidationError(
                {
                    "internship": (
                        "You have already saved "
                        "this internship."
                    )
                }
            )


class StudentSavedInternshipListView(
    generics.ListAPIView
):
    """
    Return internships saved by the authenticated
    student.
    """

    serializer_class = SavedInternshipSerializer

    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(
        tags=["Internships"],
        summary="Get Saved Internships",
        description="Retrieve list of internships saved by the authenticated student",
        responses={200: SavedInternshipSerializer(many=True)}
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):

        if not is_student_user(self.request.user):
            return SavedInternship.objects.none()

        return (
            SavedInternship.objects
            .filter(
                student=self.request.user
            )
            .select_related("internship")
            .order_by("-created_at")
        )


class StudentUnsaveInternshipView(
    generics.DestroyAPIView
):
    """
    Remove a saved internship.
    """

    serializer_class = SavedInternshipSerializer

    permission_classes = [
        IsAuthenticated,
    ]

    lookup_field = "internship_id"
    lookup_url_kwarg = "internship_id"

    @extend_schema(
        tags=["Internships"],
        summary="Remove Saved Internship",
        description="Remove a saved internship from the student profile",
        responses={200: {'type': 'object', 'properties': {
            'message': {'type': 'string'}}}}
    )
    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)

    def get_queryset(self):

        if not is_student_user(self.request.user):
            return SavedInternship.objects.none()

        return SavedInternship.objects.filter(
            student=self.request.user
        )

    def destroy(self, request, *args, **kwargs):

        instance = self.get_object()

        instance.delete()

        return Response(
            {
                "message": (
                    "Internship removed from "
                    "saved internships."
                )
            },
            status=status.HTTP_200_OK,
        )


class StudentApplicationCreateView(
    generics.CreateAPIView
):
    """
    Record that the authenticated student has
    applied for an internship.
    """

    serializer_class = (
        InternshipApplicationSerializer
    )

    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(
        tags=["Applications"],
        summary="Create Application",
        description="Record that the student has applied for an internship",
        request=InternshipApplicationSerializer,
        responses={201: InternshipApplicationSerializer},
        examples=[OpenApiExample("Create Application", value={
                                 "internship": 1, "notes": "Applied on company portal"})]
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def perform_create(self, serializer):

        if not is_student_user(self.request.user):
            raise PermissionDenied(
                "Only students can track internship applications."
            )

        internship = serializer.validated_data[
            "internship"
        ]

        try:
            serializer.save(
                student=self.request.user
            )

        except IntegrityError:
            raise serializers.ValidationError(
                {
                    "internship": (
                        "You have already recorded "
                        "an application for this internship."
                    )
                }
            )

        # Phase 9 — record a lightweight application in the activity log.
        log_student_activity(
            student=self.request.user,
            action="internship_apply",
            description=(
                f"Applied for internship "
                f"'{internship.title}'."
            ),
            metadata={"internship_id": internship.id},
        )


class StudentApplicationListView(
    generics.ListAPIView
):
    """
    Return applications belonging only to the
    authenticated student.
    """

    serializer_class = (
        InternshipApplicationSerializer
    )

    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(
        tags=["Applications"],
        summary="Get Applications",
        description="Retrieve list of internship applications for the authenticated student",
        responses={200: InternshipApplicationSerializer(many=True)}
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):

        if not is_student_user(self.request.user):
            return InternshipApplication.objects.none()

        return (
            InternshipApplication.objects
            .filter(
                student=self.request.user
            )
            .select_related("internship")
            .order_by("-created_at")
        )


class StudentApplicationDetailView(
    generics.RetrieveUpdateAPIView
):
    """
    Retrieve or update an application belonging
    to the authenticated student.
    """

    serializer_class = (
        InternshipApplicationSerializer
    )

    permission_classes = [
        IsAuthenticated,
    ]

    @extend_schema(tags=["Applications"], summary="Get Application Details")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(tags=["Applications"], summary="Update Application Status/Notes", request=InternshipApplicationSerializer, responses={200: InternshipApplicationSerializer})
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)

    @extend_schema(tags=["Applications"], summary="Partial Update Application Status/Notes", request=InternshipApplicationSerializer, responses={200: InternshipApplicationSerializer})
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    def get_queryset(self):

        if not is_student_user(self.request.user):
            return InternshipApplication.objects.none()

        return InternshipApplication.objects.filter(
            student=self.request.user
        )


class AdminInternshipVerificationView(
    GenericAPIView
):
    """
    Verify or reject an internship.
    """

    permission_classes = [
        IsAdminRole,
    ]
    serializer_class = InternshipVerificationSerializer

    @extend_schema(
        tags=["Admin Internships"],
        summary="Verify or Reject Internship",
        description="Verify or reject a pending internship posting. Admin only.",
        request=InternshipVerificationSerializer,
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'},
                    'internship_id': {'type': 'integer'},
                    'status': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Verify Internship",
                value={"action": "verify"},
            ),
            OpenApiExample(
                "Reject Internship",
                value={"action": "reject",
                       "rejection_reason": "Incomplete position description"},
            )
        ]
    )
    def post(self, request, pk):

        try:
            internship = Internship.objects.get(
                pk=pk
            )

        except Internship.DoesNotExist:
            return Response(
                {
                    "detail": (
                        "Internship not found."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        action = serializer.validated_data[
            "action"
        ]

        if action == "verify":

            internship.status = (
                Internship.STATUS_ACTIVE
            )

            internship.is_verified = True

            internship.verified_at = (
                timezone.now()
            )

            internship.verified_by = (
                request.user
            )

            internship.rejection_reason = ""

            internship.save(
                update_fields=[
                    "status",
                    "is_verified",
                    "verified_at",
                    "verified_by",
                    "rejection_reason",
                    "updated_at",
                ]
            )

            return Response(
                {
                    "message": (
                        "Internship verified "
                        "successfully."
                    ),
                    "internship_id": internship.id,
                    "status": internship.status,
                },
                status=status.HTTP_200_OK,
            )

        rejection_reason = (
            serializer.validated_data[
                "rejection_reason"
            ]
        )

        internship.status = (
            Internship.STATUS_REJECTED
        )

        internship.rejection_reason = (
            rejection_reason
        )

        internship.verified_at = None
        internship.verified_by = None

        internship.save(
            update_fields=[
                "status",
                "rejection_reason",
                "verified_at",
                "verified_by",
                "updated_at",
            ]
        )

        return Response(
            {
                "message": (
                    "Internship rejected."
                ),
                "internship_id": internship.id,
                "status": internship.status,
            },
            status=status.HTTP_200_OK,
        )


# ───────────────────────────────────────────────────────────────────
# Phase 9 Task 9.2 — Internship Review Queue & Data-Source Health
# ───────────────────────────────────────────────────────────────────


class AdminInternshipReviewListView(generics.ListAPIView):
    """
    List internships flagged for admin review.

    ``GET /api/internships/admin/review/``

    Returns paginated internships where ``needs_review=True``, ordered by
    most recently created.  Includes duplicate-flag details, URL
    validation results, and low-confidence skill matches so
    administrators can make informed approve / reject / remove decisions.
    """

    serializer_class = AdminInternshipReviewSerializer
    permission_classes = [IsAdminRole]
    pagination_class = InternshipPagination

    filter_backends = [
        DjangoFilterBackend,
        SearchFilter,
        OrderingFilter,
    ]

    search_fields = [
        "title",
        "organization_name",
    ]

    ordering_fields = [
        "created_at",
        "updated_at",
        "last_seen_at",
    ]

    ordering = ["-created_at"]

    def get_queryset(self):
        qs = (
            Internship.objects
            .filter(needs_review=True)
            .select_related("source", "data_source")
            .prefetch_related("duplicate_flags")
        )

        # Optional filter by review reason
        reason = self.request.query_params.get("reason")
        if reason == "broken_link":
            qs = qs.filter(
                url_validation__isnull=False,
            ).extra(
                where=[
                    "internship.url_validation::text LIKE %s"
                ],
                params=['%"valid": false%'],
            )
        elif reason == "near_duplicate":
            from django.db.models import Count
            qs = qs.annotate(
                pending_flags=Count(
                    "duplicate_flags",
                    filter=Q(
                        duplicate_flags__review_status=(
                            InternshipDuplicateFlag.REVIEW_PENDING
                        )
                    ),
                ),
            ).filter(pending_flags__gt=0)

        return qs


def _resolve_internship(request, pk):
    """Fetch an internship by pk or return None + 404 Response."""
    try:
        internship = Internship.objects.get(pk=pk)
    except Internship.DoesNotExist:
        return None, Response(
            {"detail": "Internship not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return internship, None


def _resolve_pending_duplicate_flags(internship):
    """Return all pending ``InternshipDuplicateFlag`` for an internship."""
    return InternshipDuplicateFlag.objects.filter(
        internship=internship,
        review_status=InternshipDuplicateFlag.REVIEW_PENDING,
    )


class AdminInternshipApproveView(APIView):
    """
    Approve a flagged internship for the review queue.

    ``POST /api/internships/admin/<id>/approve/``

    Sets status to ``active``, clears ``needs_review``, marks as verified,
    and resolves any pending near-duplicate flags.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Approve flagged internship",
        description="Approve a flagged internship: set active, verify, and clear review state.",
        request=None,
        responses={
            200: {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "internship_id": {"type": "integer"},
                    "status": {"type": "string"},
                    "needs_review": {"type": "boolean"},
                },
            }
        },
    )
    def post(self, request, pk):
        internship, err = _resolve_internship(request, pk)
        if err is not None:
            return err

        if not internship.needs_review:
            return Response(
                {
                    "detail": (
                        "Internship is not flagged for review."
                    ),
                    "internship_id": internship.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        internship.status = Internship.STATUS_ACTIVE
        internship.is_verified = True
        internship.needs_review = False
        internship.verified_at = timezone.now()
        internship.verified_by = request.user
        internship.rejection_reason = ""
        internship.save(
            update_fields=[
                "status",
                "is_verified",
                "needs_review",
                "verified_at",
                "verified_by",
                "rejection_reason",
                "updated_at",
            ]
        )

        # Resolve pending duplicate flags
        _resolve_pending_duplicate_flags(internship).update(
            review_status=InternshipDuplicateFlag.REVIEW_RESOLVED,
        )

        return Response(
            {
                "message": "Internship approved successfully.",
                "internship_id": internship.id,
                "status": internship.status,
                "needs_review": internship.needs_review,
            },
            status=status.HTTP_200_OK,
        )


class AdminInternshipRejectView(APIView):
    """
    Reject a flagged internship.

    ``POST /api/internships/admin/<id>/reject/``

    Sets status to ``rejected``, clears ``needs_review``, stores the
    rejection reason, and resolves pending near-duplicate flags.
    """

    permission_classes = [IsAdminRole]
    serializer_class = InternshipVerificationSerializer

    @extend_schema(
        tags=["Admin Internships"],
        summary="Reject flagged internship",
        description="Reject a flagged internship: set rejected, store reason, clear review state.",
        request=InternshipVerificationSerializer,
        responses={
            200: {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "internship_id": {"type": "integer"},
                    "status": {"type": "string"},
                    "needs_review": {"type": "boolean"},
                },
            }
        },
    )
    def post(self, request, pk):
        internship, err = _resolve_internship(request, pk)
        if err is not None:
            return err

        if not internship.needs_review:
            return Response(
                {
                    "detail": (
                        "Internship is not flagged for review."
                    ),
                    "internship_id": internship.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InternshipVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        rejection_reason = serializer.validated_data.get(
            "rejection_reason", ""
        )

        internship.status = Internship.STATUS_REJECTED
        internship.needs_review = False
        internship.rejection_reason = rejection_reason
        internship.verified_at = None
        internship.verified_by = None
        internship.save(
            update_fields=[
                "status",
                "needs_review",
                "rejection_reason",
                "verified_at",
                "verified_by",
                "updated_at",
            ]
        )

        _resolve_pending_duplicate_flags(internship).update(
            review_status=InternshipDuplicateFlag.REVIEW_RESOLVED,
        )

        return Response(
            {
                "message": "Internship rejected.",
                "internship_id": internship.id,
                "status": internship.status,
                "needs_review": internship.needs_review,
            },
            status=status.HTTP_200_OK,
        )


class AdminInternshipRemoveView(APIView):
    """
    Remove a flagged internship.

    ``POST /api/internships/admin/<id>/remove/``

    Soft-removes the internship by setting status to ``removed`` and
    clearing ``needs_review``.  Also resolves pending near-duplicate flags.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Remove flagged internship",
        description="Soft-remove a flagged internship: set status removed and clear review state.",
        request=None,
        responses={
            200: {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "internship_id": {"type": "integer"},
                    "status": {"type": "string"},
                    "needs_review": {"type": "boolean"},
                },
            }
        },
    )
    def post(self, request, pk):
        internship, err = _resolve_internship(request, pk)
        if err is not None:
            return err

        if not internship.needs_review:
            return Response(
                {
                    "detail": (
                        "Internship is not flagged for review."
                    ),
                    "internship_id": internship.id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        internship.status = Internship.STATUS_REMOVED
        internship.needs_review = False
        internship.save(
            update_fields=[
                "status",
                "needs_review",
                "updated_at",
            ]
        )

        _resolve_pending_duplicate_flags(internship).update(
            review_status=InternshipDuplicateFlag.REVIEW_RESOLVED,
        )

        return Response(
            {
                "message": "Internship removed successfully.",
                "internship_id": internship.id,
                "status": internship.status,
                "needs_review": internship.needs_review,
            },
            status=status.HTTP_200_OK,
        )


class DataSourceHealthView(generics.ListAPIView):
    """
    Data-source health monitoring for administrators.

    ``GET /api/admin/data-sources/health/``

    Returns one entry per ``InternshipSource`` with the most recent
    ``InternshipCollectionLog`` data: run status, timestamps, error
    information, and record counts.
    """

    serializer_class = DataSourceHealthSerializer
    permission_classes = [IsAdminRole]

    @extend_schema(
        tags=["Admin Data Sources"],
        summary="Data source health monitoring",
        description=(
            "Returns health information for each internship source, "
            "including last run status, timestamps, and error details."
        ),
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        from django.db.models import OuterRef, Subquery

        latest_log = (
            InternshipCollectionLog.objects
            .filter(source=OuterRef("pk"))
            .order_by("-started_at")
        )

        return (
            InternshipSource.objects
            .annotate(
                total_runs=Count("collection_logs"),
                last_run_status=Subquery(
                    latest_log.values("status")[:1]
                ),
                last_run_started_at=Subquery(
                    latest_log.values("started_at")[:1]
                ),
                last_run_completed_at=Subquery(
                    latest_log.values("completed_at")[:1]
                ),
                last_error=Subquery(
                    latest_log.values("error_message")[:1]
                ),
                last_records_found=Subquery(
                    latest_log.values("records_found")[:1]
                ),
                last_records_created=Subquery(
                    latest_log.values("records_created")[:1]
                ),
                last_records_failed=Subquery(
                    latest_log.values("records_failed")[:1]
                ),
            )
            .order_by("name")
        )

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StudentDashboardView(GenericAPIView):
    """
    Return internship statistics and recent
    activity for the authenticated student.
    """

    # Role-based access control (Task 2.6): only students may view the
    # student dashboard; an admin JWT receives 403.
    permission_classes = [
        IsStudent,
    ]

    @extend_schema(
        tags=["Internships"],
        summary="Get Student Dashboard",
        description="Retrieve stats, recent applications, and saved internships for the authenticated student",
        responses={200: {
            'type': 'object',
            'properties': {
                'saved_internships': {'type': 'integer'},
                'total_applications': {'type': 'integer'},
                'applied_applications': {'type': 'integer'},
                'interview_applications': {'type': 'integer'},
                'accepted_applications': {'type': 'integer'},
                'rejected_applications': {'type': 'integer'},
                'withdrawn_applications': {'type': 'integer'},
                'active_saved_internships': {'type': 'integer'},
                'recent_applications': {'type': 'array'},
                'recent_saved': {'type': 'array'},
            }
        }}
    )
    def get(self, request):

        if not is_student_user(request.user):
            raise PermissionDenied(
                "Only students can access the "
                "student dashboard."
            )

        saved_count = (
            SavedInternship.objects
            .filter(
                student=request.user
            )
            .count()
        )

        applications = (
            InternshipApplication.objects
            .filter(
                student=request.user
            )
        )

        total_applications = applications.count()

        applied_count = applications.filter(
            status=InternshipApplication.STATUS_APPLIED
        ).count()

        interview_count = applications.filter(
            status=InternshipApplication.STATUS_INTERVIEW
        ).count()

        accepted_count = applications.filter(
            status=InternshipApplication.STATUS_ACCEPTED
        ).count()

        rejected_count = applications.filter(
            status=InternshipApplication.STATUS_REJECTED
        ).count()

        withdrawn_count = applications.filter(
            status=InternshipApplication.STATUS_WITHDRAWN
        ).count()

        recent_applications = (
            applications
            .select_related("internship")
            .order_by("-updated_at")[:5]
        )

        recent_saved = (
            SavedInternship.objects
            .filter(
                student=request.user
            )
            .select_related("internship")
            .order_by("-created_at")[:5]
        )

        active_saved_count = (
            SavedInternship.objects
            .filter(
                student=request.user,
                internship__status=(
                    Internship.STATUS_ACTIVE
                ),
            )
            .count()
        )

        return Response(
            {
                "saved_internships": saved_count,

                "total_applications": (
                    total_applications
                ),

                "applied_applications": (
                    applied_count
                ),

                "interview_applications": (
                    interview_count
                ),

                "accepted_applications": (
                    accepted_count
                ),

                "rejected_applications": (
                    rejected_count
                ),

                "withdrawn_applications": (
                    withdrawn_count
                ),

                "active_saved_internships": active_saved_count,

                "recent_applications": (
                    InternshipApplicationSerializer(
                        recent_applications,
                        many=True,
                    ).data
                ),

                "recent_saved_internships": (
                    SavedInternshipSerializer(
                        recent_saved,
                        many=True,
                    ).data
                ),
            },
            status=status.HTTP_200_OK,
        )


class AdminDashboardView(GenericAPIView):
    """
    Platform-wide dashboard for administrators.
    """

    permission_classes = [
        IsAdminRole,
    ]

    @extend_schema(
        tags=["Admin Internships"],
        summary="Get Admin Dashboard",
        description="Retrieve platform-wide statistics, recent internships, and collection logs for admin",
        responses={200: {
            'type': 'object',
            'properties': {
                'total_students': {'type': 'integer'},
                'total_internships': {'type': 'integer'},
                'draft_internships': {'type': 'integer'},
                'active_internships': {'type': 'integer'},
                'rejected_internships': {'type': 'integer'},
                'expired_internships': {'type': 'integer'},
                'total_applications': {'type': 'integer'},
                'applied_applications': {'type': 'integer'},
                'interview_applications': {'type': 'integer'},
                'accepted_applications': {'type': 'integer'},
                'rejected_applications': {'type': 'integer'},
                'withdrawn_applications': {'type': 'integer'},
                'total_collection_logs': {'type': 'integer'},
                'successful_collections': {'type': 'integer'},
                'failed_collections': {'type': 'integer'},
                'pending_verification': {'type': 'integer'},
                'recent_internships': {'type': 'array'},
                'latest_collection_logs': {'type': 'array'},
            }
        }}
    )
    def get(self, request):

        total_students = User.objects.filter(
            role="student"
        ).count()

        total_internships = Internship.objects.count()

        draft_internships = Internship.objects.filter(
            status=Internship.STATUS_DRAFT
        ).count()

        active_internships = Internship.objects.filter(
            status=Internship.STATUS_ACTIVE
        ).count()

        rejected_internships = Internship.objects.filter(
            status=Internship.STATUS_REJECTED
        ).count()

        expired_internships = Internship.objects.filter(
            status=Internship.STATUS_EXPIRED
        ).count()

        applications = InternshipApplication.objects.select_related(
            'internship').all()

        total_applications = applications.count()

        applied_applications = applications.filter(
            status=InternshipApplication.STATUS_APPLIED
        ).count()

        interview_applications = applications.filter(
            status=InternshipApplication.STATUS_INTERVIEW
        ).count()

        accepted_applications = applications.filter(
            status=InternshipApplication.STATUS_ACCEPTED
        ).count()

        rejected_applications = applications.filter(
            status=InternshipApplication.STATUS_REJECTED
        ).count()

        withdrawn_applications = applications.filter(
            status=InternshipApplication.STATUS_WITHDRAWN
        ).count()

        total_collection_logs = (
            InternshipCollectionLog.objects.count()
        )

        successful_collections = (
            InternshipCollectionLog.objects.filter(
                status="success"
            ).count()
        )

        failed_collections = (
            InternshipCollectionLog.objects.filter(
                status="failed"
            ).count()
        )

        pending_verification = Internship.objects.filter(
            status=Internship.STATUS_DRAFT
        ).count()

        recent_internships = (
            Internship.objects
            .order_by("-created_at")[:10]
        )

        latest_collection_logs = (
            InternshipCollectionLog.objects
            .order_by("-started_at")[:5]
        )

        return Response(
            {
                "total_students": total_students,

                "total_internships": total_internships,

                "draft_internships": draft_internships,

                "active_internships": active_internships,

                "rejected_internships": (
                    rejected_internships
                ),

                "expired_internships": (
                    expired_internships
                ),

                "total_applications": (
                    total_applications
                ),

                "applied_applications": (
                    applied_applications
                ),

                "interview_applications": (
                    interview_applications
                ),

                "accepted_applications": (
                    accepted_applications
                ),

                "rejected_applications": (
                    rejected_applications
                ),

                "withdrawn_applications": (
                    withdrawn_applications
                ),

                "total_collection_logs": (
                    total_collection_logs
                ),

                "successful_collections": (
                    successful_collections
                ),

                "failed_collections": (
                    failed_collections
                ),

                "pending_verification": (
                    pending_verification,
                ),
                "recent_internships": (
                    AdminRecentInternshipSerializer(
                        recent_internships,
                        many=True,
                    ).data
                ),
                "latest_collection_logs": (
                    AdminCollectionLogSerializer(
                        latest_collection_logs,
                        many=True,
                    ).data
                ),
            },
            status=status.HTTP_200_OK,
        )


class AdminSkillListCreateView(
    generics.ListCreateAPIView
):
    """
    Admin manages reusable skills.
    """

    serializer_class = SkillSerializer

    permission_classes = [
        IsAdminRole,
    ]

    queryset = Skill.objects.all().order_by('name')

    @extend_schema(
        tags=["Admin Internships"],
        summary="Admin: List all skills",
        description="Retrieve a list of all skills defined in the system. Admin only."
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        tags=["Admin Internships"],
        summary="Admin: Create skill",
        description="Create a new skill in the system. Admin only.",
        request=SkillSerializer,
        responses={201: SkillSerializer},
        examples=[OpenApiExample("Create Skill", value={
                                 "name": "Python", "description": "Programming language", "is_active": True})]
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class AdminSkillDetailView(
    generics.RetrieveUpdateDestroyAPIView
):
    """
    Admin manages an individual skill.
    """

    serializer_class = SkillSerializer

    permission_classes = [
        IsAdminRole,
    ]

    queryset = Skill.objects.all().order_by('name')

    @extend_schema(tags=["Admin Internships"], summary="Admin: Get skill details")
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Update skill", request=SkillSerializer, responses={200: SkillSerializer})
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Partial update skill", request=SkillSerializer, responses={200: SkillSerializer})
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    @extend_schema(tags=["Admin Internships"], summary="Admin: Delete skill")
    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)


from django.shortcuts import get_object_or_404


@extend_schema(tags=["Admin Internships"])
class AdminInternshipPublishView(APIView):
    """
    Publish or reject a company internship posting.
    POST /api/internships/admin/<id>/publish/
    Body: {"publish": true} or {"publish": false, "rejection_reason": "..."}
    """
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        internship = get_object_or_404(Internship, pk=pk)
        publish = request.data.get("publish", True)
        if publish:
            internship.is_published = True
            internship.status = Internship.STATUS_ACTIVE
            internship.is_verified = True
            internship.needs_review = False
            internship.published_at = timezone.now()
            internship.published_by = request.user
            internship.save()
            return Response({
                "message": f"Internship '{internship.title}' published successfully.",
                "internship": InternshipSerializer(internship).data,
            }, status=status.HTTP_200_OK)
        else:
            reason = request.data.get("rejection_reason", "Does not meet platform guidelines.")
            internship.is_published = False
            internship.status = Internship.STATUS_REJECTED
            internship.rejection_reason = reason
            internship.save()
            return Response({
                "message": f"Internship '{internship.title}' rejected.",
                "internship": InternshipSerializer(internship).data,
            }, status=status.HTTP_200_OK)


@extend_schema(tags=["Admin Internships"])
class AdminPendingInternshipsListView(generics.ListAPIView):
    """
    List internships pending admin publication.
    GET /api/internships/admin/pending/
    """
    serializer_class = InternshipSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    pagination_class = InternshipPagination

    def get_queryset(self):
        return Internship.objects.filter(is_published=False).exclude(status=Internship.STATUS_REJECTED).order_by("-created_at")

