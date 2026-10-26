from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny
from apps.accounts.views import (
    StudentRegistrationView,
    EmailVerificationLinkView,
    LoginView,
    PasswordResetView,
    PasswordResetConfirmView,
    AuthTokenRefreshView,
)
from apps.administration.views import (
    AdminAnalyticsView,
    AdminRecommendationAnalyticsView,
)


def health_check(request):
    """Lightweight endpoint — proves the backend is reachable from the frontend."""
    return JsonResponse({"status": "OK"})


def run_migrations(request):
    """Run database migrations and initialize site/apps."""
    import io
    from django.core.management import call_command
    buf = io.StringIO()
    try:
        call_command("migrate", interactive=False, stdout=buf, stderr=buf)
        migration_output = buf.getvalue()

        from django.contrib.sites.models import Site
        site, created = Site.objects.get_or_create(
            id=1,
            defaults={"domain": "onrender.com", "name": "AI Internship Platform"}
        )

        google_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "") or ""
        google_client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "") or ""
        app_info = "No Google Client ID provided"
        if google_client_id:
            from allauth.socialaccount.models import SocialApp
            app, _ = SocialApp.objects.get_or_create(
                provider="google",
                defaults={"name": "Google", "client_id": google_client_id, "secret": google_client_secret}
            )
            app.client_id = google_client_id
            app.secret = google_client_secret
            app.sites.add(site)
            app.save()
            app_info = f"SocialApp configured with client_id={google_client_id[:8]}..."

        return JsonResponse({
            "status": "OK",
            "migration_output": migration_output,
            "site": {"id": site.id, "domain": site.domain, "name": site.name},
            "app_info": app_info,
        })
    except Exception as e:
        import traceback
        return JsonResponse({
            "status": "ERROR",
            "migration_output": buf.getvalue(),
            "error": str(e),
            "traceback": traceback.format_exc(),
        }, status=200)


def debug_oauth(request):
    """Diagnostic endpoint to inspect live Google OAuth configuration and errors."""
    try:
        from django.contrib.sites.models import Site
        from allauth.socialaccount.models import SocialApp
        from allauth.socialaccount.providers.google.views import oauth2_login
        
        # Check if site table exists, if not trigger migration
        try:
            site = Site.objects.get_current(request)
        except Exception:
            import io
            from django.core.management import call_command
            buf = io.StringIO()
            call_command("migrate", interactive=False, stdout=buf, stderr=buf)
            site, _ = Site.objects.get_or_create(id=1, defaults={"domain": "onrender.com", "name": "AI Internship Platform"})

        apps = list(SocialApp.objects.all().values("id", "provider", "name", "client_id"))
        
        resp = oauth2_login(request)
        return JsonResponse({
            "status": "OK",
            "site": {"id": site.id, "domain": site.domain, "name": site.name},
            "apps": apps,
            "redirect_url": resp.get("Location", "") if hasattr(resp, "get") else str(resp),
            "status_code": resp.status_code,
        })
    except Exception as e:
        import traceback
        return JsonResponse({
            "status": "ERROR",
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc(),
        }, status=200)


urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check — used by frontend to verify backend connectivity
    path("api/health/", health_check, name="health-check"),
    path("api/debug-oauth/", debug_oauth, name="debug-oauth"),
    path("api/run-migrations/", run_migrations, name="run-migrations"),
    # API Documentation (kept public — override the global IsAuthenticated)
    path(
        "api/schema/",
        SpectacularAPIView.as_view(permission_classes=[AllowAny]),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(
            url_name="schema", permission_classes=[AllowAny]),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(
            url_name="schema", permission_classes=[AllowAny]),
        name="redoc",
    ),
    path(
        "api/v1/auth/",
        include("apps.accounts.urls"),
    ),
    path(
        "api/accounts/",
        include("apps.accounts.urls"),
    ),
    # Phase 2 Task 2.1 — canonical auth registration endpoint
    path(
        "api/auth/register/",
        StudentRegistrationView.as_view(),
        name="auth-register",
    ),
    # Phase 2 Task 2.3 — unified login (JWT, role claim, Figure 5.1)
    path(
        "api/auth/login/",
        LoginView.as_view(),
        name="auth-login",
    ),
    # Phase 2 Task 2.4 — token refresh (public by SimpleJWT permission_classes)
    path(
        "api/auth/refresh/",
        AuthTokenRefreshView.as_view(),
        name="auth-token-refresh",
    ),
    # Phase 2 Task 2.5 — password reset (request + confirm with path token)
    path(
        "api/auth/password-reset/",
        PasswordResetView.as_view(),
        name="auth-password-reset",
    ),
    path(
        "api/auth/forgot-password/",
        PasswordResetView.as_view(),
        name="auth-forgot-password",
    ),
    path(
        "api/auth/password-reset-confirm/<str:uid>/<str:token>/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    # Phase 2 Task 2.2 — canonical email verification link (single-use)
    path(
        "api/auth/verify-email/<str:uid>/<str:token>/",
        EmailVerificationLinkView.as_view(),
        name="auth-verify-email-link",
    ),
    path(
        "accounts/",
        include("allauth.urls")
    ),
    # Student profile module (Phase 3 & Task 2.2) — canonical prefixes.
    path(
        "api/v1/students/",
        include("apps.students.urls"),
    ),
    path(
        "api/students/",
        include("apps.students.urls"),
    ),
    path(
        "api/internships/",
        include("apps.internships.urls"),
    ),
    path(
        "api/recommendations/",
        include("apps.recommendations.urls"),
    ),
    path(
        "api/postings/",
        include("apps.postings.urls"),
    ),
    path(
        "api/companies/",
        include("apps.companies.urls"),
    ),
    path(
        "api/applications/",
        include("apps.applications.urls"),
    ),
    # Projects & Weekly Logbooks (Task 2.3)
    path(
        "api/v1/projects/",
        include("apps.projects.urls"),
    ),
    # Campus Logistics Clearance (Food & Housing)
    path(
        "api/v1/logistics/",
        include("apps.logistics.urls"),
    ),
    path(
        "api/logistics/",
        include("apps.logistics.urls"),
    ),
    # University-Industry Linkage (UIL) Profiles & Workflows
    path(
        "api/v1/uil-profiles/",
        include("apps.uil_profiles.urls"),
    ),
    path(
        "api/uil-profiles/",
        include("apps.uil_profiles.urls"),
    ),
    # Campus Software House Teams & Logbooks
    path(
        "api/v1/teams/",
        include("apps.teams.urls"),
    ),
    path(
        "api/teams/",
        include("apps.teams.urls"),
    ),
    # Notification Center (Universal in-app alerts)
    path(
        "api/v1/notifications/",
        include("apps.notifications.urls"),
    ),
    path(
        "api/notifications/",
        include("apps.notifications.urls"),
    ),
    # Additional v1 API Aliases
    path(
        "api/v1/internships/",
        include("apps.internships.urls"),
    ),
    path(
        "api/v1/companies/",
        include("apps.companies.urls"),
    ),
    path(
        "api/v1/accounts/",
        include("apps.accounts.urls"),
    ),
    # Task 5.10 — admin manual syncing of a single data source.
    # POST /api/admin/data-sources/<id>/sync-now/
    path(
        "api/admin/data-sources/",
        include("apps.data_sources.urls"),
    ),
    # Phase 9 Task 9.1 — Administrator User Management.
    # GET /api/admin/students/ and related activate/deactivate/activity actions.
    path(
        "api/admin/students/",
        include("apps.administration.urls"),
    ),
    path(
        "api/admin/analytics/",
        AdminAnalyticsView.as_view(),
        name="admin-analytics",
    ),
    path(
        "api/admin/analytics/ai/",
        AdminRecommendationAnalyticsView.as_view(),
        name="admin-recommendation-analytics",
    ),
]

urlpatterns += static(
    settings.MEDIA_URL,
    document_root=settings.MEDIA_ROOT,
)
