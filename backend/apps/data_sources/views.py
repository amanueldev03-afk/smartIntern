from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.internships.permissions import IsAdminRole

from .models import DataSource
from .tasks import collect_data_source


class DataSourceSyncNowView(APIView):
    """
    Manually trigger collection of one ``DataSource`` immediately
    (Task 5.10, Section 3.10.1 / Figure 3.8).

    Queues the same ``collect_data_source`` task that Celery Beat runs
    on its periodic schedule, so a manual sync fires the identical
    logic right away rather than waiting for the next interval.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        tags=["Admin Data Sources"],
        summary="Trigger DataSource sync",
        description=(
            "Queue an immediate collection run for a single data source. "
            "Admin only."
        ),
        request=None,
        responses={
            202: {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "source": {"type": "string"},
                    "task_id": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
            503: {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "source": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
        },
    )
    def post(self, request, pk):
        try:
            source = DataSource.objects.get(pk=pk)
        except DataSource.DoesNotExist:
            return Response(
                {"detail": "Data source not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not source.is_active:
            return Response(
                {"detail": "This data source is inactive."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            task = collect_data_source.delay(source.id)
        except (AttributeError, RuntimeError, ConnectionError) as exc:  # broker unavailable — surface it
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to queue data source sync: {exc}")
            return Response(
                {
                    "message": (
                        "Failed to start sync. Celery may not be available."
                    ),
                    "source": source.name,
                    "status": "failed",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "message": "Data source sync started.",
                "source": source.name,
                "task_id": task.id,
                "status": "queued",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class DataSourceHealthView(generics.ListAPIView):
    """
    Data-source health monitoring for the new pipeline.

    ``GET /api/admin/data-sources/health/``

    Returns one entry per ``DataSource`` showing the ``is_active`` flag,
    ``last_synced_at`` timestamp, and total internship count sourced from
    that data source.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        tags=["Admin Data Sources"],
        summary="Data source health (new pipeline)",
        description=(
            "Returns health information for each DataSource in the "
            "new collection pipeline: active state, last sync time, "
            "and internship count."
        ),
    )
    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def get_queryset(self):
        return DataSource.objects.order_by("name")

    def list(self, request, *args, **kwargs):
        sources = self.get_queryset()

        data = []
        for source in sources:
            internship_count = source.internships.count()
            data.append({
                "id": source.id,
                "name": source.name,
                "type": source.type,
                "is_active": source.is_active,
                "base_url": source.base_url,
                "last_synced_at": source.last_synced_at,
                "internship_count": internship_count,
                "created_at": source.created_at,
                "updated_at": source.updated_at,
            })

        return Response(data)
