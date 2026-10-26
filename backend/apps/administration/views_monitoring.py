"""
Monitoring views for Task 11.7 - Logging & Monitoring

Contains staging-only test endpoints for verifying Sentry integration
and monitoring capabilities.
"""

import logging
from django.conf import settings
from django.http import JsonResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import status

logger = logging.getLogger(__name__)


class StagingExceptionTestView(APIView):
    """
    Staging-only endpoint to trigger a deliberate exception for Sentry testing.
    
    This endpoint is ONLY enabled in staging environment to verify that:
    - Sentry captures exceptions correctly
    - Stack traces are useful
    - Request context is captured
    - Sensitive data is scrubbed
    
    SECURITY: This endpoint is disabled in production.
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """
        Trigger a controlled ZeroDivisionError to test Sentry integration.
        
        Only works when DJANGO_ENV=staging.
        Returns 403 in production or other environments.
        """
        request_id = getattr(request, "id", "unknown")
        environment = getattr(settings, "DJANGO_ENV", "development")
        
        # Only allow in staging environment
        if environment != "staging":
            logger.warning(
                "staging_exception_test.blocked",
                extra={
                    "request_id": request_id,
                    "user_id": request.user.id,
                    "environment": environment,
                    "reason": "not_staging_environment",
                }
            )
            return JsonResponse(
                {
                    "detail": "This endpoint is only available in staging environment.",
                    "environment": environment,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        
        logger.info(
            "staging_exception_test.triggered",
            extra={
                "request_id": request_id,
                "user_id": request.user.id,
                "environment": environment,
            }
        )
        
        # Trigger a controlled exception
        # This will be captured by Sentry
        result = 1 / 0
        
        return JsonResponse(
            {"status": "ok"},
            status=status.HTTP_200_OK,
        )
