from django.urls import path

from .views import (
    AdminCompanyListCreateView,
    AdminCompanyDetailView,
    EmployerInternshipListCreateView,
    EmployerApplicationListView,
    EmployerApplicationUpdateView,
    CompanyRecommendedStudentsView,
    CompanyStudentInvitationCreateView,
    StudentInvitationListView,
    StudentInvitationRespondView,
    CompanyDirectChatListView,
    CompanyDirectChatSendView,
)

app_name = "companies"

urlpatterns = [
    path(
        "",
        AdminCompanyListCreateView.as_view(),
        name="company-list-create",
    ),
    path(
        "<int:pk>/",
        AdminCompanyDetailView.as_view(),
        name="company-detail",
    ),
    path(
        "my-internships/",
        EmployerInternshipListCreateView.as_view(),
        name="employer-internship-list-create",
    ),
    path(
        "applications/",
        EmployerApplicationListView.as_view(),
        name="employer-application-list",
    ),
    path(
        "applications/<int:pk>/status/",
        EmployerApplicationUpdateView.as_view(),
        name="employer-application-status",
    ),
    path(
        "internships/<int:pk>/recommended-students/",
        CompanyRecommendedStudentsView.as_view(),
        name="company-recommended-students",
    ),
    path(
        "invitations/",
        CompanyStudentInvitationCreateView.as_view(),
        name="company-create-invitation",
    ),
    path(
        "student/invitations/",
        StudentInvitationListView.as_view(),
        name="student-invitations",
    ),
    path(
        "student/invitations/<uuid:pk>/respond/",
        StudentInvitationRespondView.as_view(),
        name="student-invitation-respond",
    ),
    path(
        "chat/<uuid:invitation_id>/",
        CompanyDirectChatListView.as_view(),
        name="company-direct-chat-list",
    ),
    path(
        "chat/<uuid:invitation_id>/send/",
        CompanyDirectChatSendView.as_view(),
        name="company-direct-chat-send",
    ),
]