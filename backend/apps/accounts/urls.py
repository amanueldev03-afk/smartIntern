from django.urls import path
from .views import (
    RegisterView,
    CustomTokenObtainPairView,
    AuthTokenRefreshView,
    CurrentUserView,
    LogoutView,
    ResendVerificationView,
    ChangePasswordView,
    EmailVerificationLinkView,
    LegacyEmailVerificationView,
    LoginView,
    PasswordResetView,
    AdminPendingStaffListView,
    AdminApproveStaffView,
    UILPendingAdvisorsListView,
    UILApproveAdvisorView,
)

urlpatterns = [
    # -------------------------------------------------------------------------
    # SmartIntern-ET Core Authentication Endpoints (/api/v1/auth/)
    # -------------------------------------------------------------------------
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", CustomTokenObtainPairView.as_view(), name="auth-login"),
    path("refresh/", AuthTokenRefreshView.as_view(), name="auth-refresh"),
    path("me/", CurrentUserView.as_view(), name="auth-me"),

    # -------------------------------------------------------------------------
    # Account Management & Verification
    # -------------------------------------------------------------------------
    path("logout/", LogoutView.as_view(), name="logout"),
    path("resend-verification/", ResendVerificationView.as_view(), name="resend-verification"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("forgot-password/", PasswordResetView.as_view(), name="forgot-password"),
    path("verify-email/", LegacyEmailVerificationView.as_view(), name="verify-email"),
    path("verify-email/<str:uid>/<str:token>/", EmailVerificationLinkView.as_view(), name="verify-email-link"),

    # -------------------------------------------------------------------------
    # Institutional Approval Workflow Endpoints
    # -------------------------------------------------------------------------
    path("admin/pending-staff/", AdminPendingStaffListView.as_view(), name="admin-pending-staff"),
    path("admin/approve-staff/<uuid:user_id>/", AdminApproveStaffView.as_view(), name="admin-approve-staff"),
    path("uil/pending-advisors/", UILPendingAdvisorsListView.as_view(), name="uil-pending-advisors"),
    path("uil/approve-advisor/<uuid:user_id>/", UILApproveAdvisorView.as_view(), name="uil-approve-advisor"),

    # -------------------------------------------------------------------------
    # Backward Compatibility Aliases
    # -------------------------------------------------------------------------
    path("student/login/", LoginView.as_view(), name="legacy-student-login"),
]
