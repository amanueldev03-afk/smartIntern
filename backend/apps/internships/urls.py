from django.urls import path

from .views import (
    InternshipListView,
    InternshipDetailView,
    InternshipSaveUnsaveView,
    AdminInternshipListCreateView,
    AdminInternshipDetailView,
    LatestInternshipListView,
    AdminInternshipSourceListCreateView,
    AdminInternshipSourceDetailView,
    AdminCollectionLogListView,
    AdminSourceCollectView,
    StudentSaveInternshipView,
    StudentSavedInternshipListView,
    StudentUnsaveInternshipView,
    StudentApplicationCreateView,
    StudentApplicationListView,
    StudentApplicationDetailView,
    AdminInternshipVerificationView,
    AdminInternshipReviewListView,
    AdminInternshipApproveView,
    AdminInternshipRejectView,
    AdminInternshipRemoveView,
    DataSourceHealthView,
    StudentDashboardView,
    AdminDashboardView,
    AdminSkillListCreateView,
    AdminSkillDetailView,
    AdminInternshipPublishView,
    AdminPendingInternshipsListView,
)


urlpatterns = [
    path(
        "",
        InternshipListView.as_view(),
        name="internship-list",
    ),

    path(
        "<int:pk>/",
        InternshipDetailView.as_view(),
        name="internship-detail",
    ),

    path(
        "<int:pk>/save/",
        InternshipSaveUnsaveView.as_view(),
        name="internship-save-unsave",
    ),

    path(
        "admin/",
        AdminInternshipListCreateView.as_view(),
        name="admin-internship-list-create",
    ),

    path(
        "admin/<int:pk>/",
        AdminInternshipDetailView.as_view(),
        name="admin-internship-detail",
    ),

    path(
        "admin/pending/",
        AdminPendingInternshipsListView.as_view(),
        name="admin-internship-pending",
    ),

    path(
        "admin/<int:pk>/publish/",
        AdminInternshipPublishView.as_view(),
        name="admin-internship-publish",
    ),

    path(
        "latest/",
        LatestInternshipListView.as_view(),
        name="latest-internships",
    ),

    path(
        "admin/sources/",
        AdminInternshipSourceListCreateView.as_view(),
        name="admin-source-list-create",
    ),

    path(
        "admin/sources/<int:pk>/",
        AdminInternshipSourceDetailView.as_view(),
        name="admin-source-detail",
    ),

    path(
        "admin/collection-logs/",
        AdminCollectionLogListView.as_view(),
        name="admin-collection-logs",
    ),

    path(
        "admin/sources/<int:pk>/collect/",
        AdminSourceCollectView.as_view(),
        name="admin-source-collect",
    ),

    path(
        "admin/dashboard/",
        AdminDashboardView.as_view(),
        name="admin-dashboard",
    ),

    path(
        "admin/skills/",
        AdminSkillListCreateView.as_view(),
        name="admin-skill-list-create",
    ),

    path(
        "admin/skills/<int:pk>/",
        AdminSkillDetailView.as_view(),
        name="admin-skill-detail",
    ),

    path(
        "saved/",
        StudentSavedInternshipListView.as_view(),
        name="student-saved-internships",
    ),

    path(
        "saved/add/",
        StudentSaveInternshipView.as_view(),
        name="student-save-internship",
    ),

    path(
        "saved/<int:internship_id>/",
        StudentUnsaveInternshipView.as_view(),
        name="student-unsave-internship",
    ),

    path(
        "applications/",
        StudentApplicationListView.as_view(),
        name="student-applications",
    ),

    path(
        "applications/add/",
        StudentApplicationCreateView.as_view(),
        name="student-application-add",
    ),

    path(
        "applications/<int:pk>/",
        StudentApplicationDetailView.as_view(),
        name="student-application-detail",
    ),

    path(
        "admin/internships/<int:pk>/verify/",
        AdminInternshipVerificationView.as_view(),
        name="admin-internship-verify",
    ),

    # Phase 9 Task 9.2 — Internship Review Queue
    path(
        "admin/review/",
        AdminInternshipReviewListView.as_view(),
        name="admin-internship-review-list",
    ),
    path(
        "admin/<int:pk>/approve/",
        AdminInternshipApproveView.as_view(),
        name="admin-internship-approve",
    ),
    path(
        "admin/<int:pk>/reject/",
        AdminInternshipRejectView.as_view(),
        name="admin-internship-reject",
    ),
    path(
        "admin/<int:pk>/remove/",
        AdminInternshipRemoveView.as_view(),
        name="admin-internship-remove",
    ),

    # Phase 9 Task 9.2 — Data-Source Health (InternshipSource + collection logs)
    path(
        "admin/data-sources/health/",
        DataSourceHealthView.as_view(),
        name="admin-internship-data-source-health",
    ),

    path(
        "dashboard/",
        StudentDashboardView.as_view(),
        name="student-dashboard",
    ),
]
