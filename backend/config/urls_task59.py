"""TEMPORARY minimal URLconf for Task 5.10 test run (no AI stack)."""
from django.urls import include, path

urlpatterns = [
    path("api/admin/data-sources/", include("apps.data_sources.urls")),
    path("api/data-sources/", include("apps.data_sources.urls")),
]
