from django.urls import path

from .views import (
    AdminStudentListView,
    AdminStudentDeactivateView,
    AdminStudentActivateView,
    AdminStudentActivityView,
)

app_name = "administration"

urlpatterns = [
    path(
        "",
        AdminStudentListView.as_view(),
        name="admin-student-list",
    ),
    path(
        "<str:pk>/deactivate/",
        AdminStudentDeactivateView.as_view(),
        name="admin-student-deactivate",
    ),
    path(
        "<str:pk>/activate/",
        AdminStudentActivateView.as_view(),
        name="admin-student-activate",
    ),
    path(
        "<str:pk>/activity/",
        AdminStudentActivityView.as_view(),
        name="admin-student-activity",
    ),
]
