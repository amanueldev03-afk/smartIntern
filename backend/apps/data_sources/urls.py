from django.urls import path

from .views import DataSourceSyncNowView, DataSourceHealthView

app_name = "data_sources"

# Admin endpoints under ``api/admin/data-sources/`` (mounted in config/urls.py).
urlpatterns = [
    path(
        "<int:pk>/sync-now/",
        DataSourceSyncNowView.as_view(),
        name="data-source-sync-now",
    ),
    # Phase 9 Task 9.2 — Data-source health monitoring
    path(
        "health/",
        DataSourceHealthView.as_view(),
        name="data-source-health",
    ),
]
