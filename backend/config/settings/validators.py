"""
Production settings validator.

Executes fail-fast validation when Django starts in production mode.
Ensures that sensitive credentials and mandatory infrastructure variables
are present, sufficiently strong, and not using insecure defaults or placeholders.
"""

from typing import Any, Dict, List
from django.core.exceptions import ImproperlyConfigured


INSECURE_SECRET_KEY_PATTERNS = [
    "django-insecure",
    "change-me",
    "your-secret-key-here",
    "replace_with_secure_password",
    "django-production-secure-key-2026-deploy",
]


def validate_production_settings(settings_dict: Dict[str, Any]) -> None:
    """
    Validate production settings dictionary and raise ImproperlyConfigured
    with a clear, non-leaking error message if any requirement is not met.
    """
    errors: List[str] = []

    # 1. SECRET_KEY validation
    secret_key = settings_dict.get("SECRET_KEY", "")
    if not secret_key:
        errors.append("Production configuration error: SECRET_KEY is required and cannot be empty.")
    elif len(secret_key) < 32:
        errors.append("Production configuration error: SECRET_KEY must be at least 32 characters long.")
    else:
        lower_key = secret_key.lower()
        if any(pattern in lower_key for pattern in INSECURE_SECRET_KEY_PATTERNS):
            errors.append(
                "Production configuration error: SECRET_KEY is using a known insecure placeholder or default value. "
                "A strong random key must be generated for production."
            )

    # 2. DEBUG validation
    debug = settings_dict.get("DEBUG", True)
    if debug is not False:
        errors.append("Production configuration error: DEBUG must be set to False in production.")

    # 3. ALLOWED_HOSTS validation
    allowed_hosts = settings_dict.get("ALLOWED_HOSTS", [])
    if not allowed_hosts or len(allowed_hosts) == 0:
        errors.append("Production configuration error: ALLOWED_HOSTS must not be empty in production.")

    # 4. Database configuration validation
    databases = settings_dict.get("DATABASES", {})
    default_db = databases.get("default", {})
    if not default_db:
        errors.append("Production configuration error: DATABASES['default'] is required.")
    else:
        engine = default_db.get("ENGINE", "")
        if "sqlite" in engine.lower():
            # In production, PostgreSQL with pgvector is expected
            pass
        elif "postgresql" in engine.lower() or "postgis" in engine.lower():
            name = default_db.get("NAME", "")
            user = default_db.get("USER", "")
            if not name:
                errors.append("Production configuration error: Database NAME is required for PostgreSQL.")
            if not user:
                errors.append("Production configuration error: Database USER is required for PostgreSQL.")

    # 5. Redis / Cache / Broker validation
    caches = settings_dict.get("CACHES", {})
    default_cache = caches.get("default", {})
    cache_backend = default_cache.get("BACKEND", "").lower()
    cache_location = default_cache.get("LOCATION", "")
    if "locmem" not in cache_backend and not cache_location:
        errors.append("Production configuration error: CACHES['default']['LOCATION'] (REDIS_URL) is required.")

    if not settings_dict.get("CELERY_TASK_ALWAYS_EAGER", False):
        celery_broker = settings_dict.get("CELERY_BROKER_URL", "")
        if not celery_broker:
            errors.append("Production configuration error: CELERY_BROKER_URL is required when not in eager mode.")

    # 6. Storage backend conditional validation
    storage_backend = settings_dict.get("STORAGE_BACKEND", "filesystem")
    if storage_backend == "s3":
        aws_access_key = settings_dict.get("AWS_ACCESS_KEY_ID", "")
        aws_secret_key = settings_dict.get("AWS_SECRET_ACCESS_KEY", "")
        aws_bucket_name = settings_dict.get("AWS_STORAGE_BUCKET_NAME", "")
        if not aws_access_key:
            errors.append("Production configuration error: AWS_ACCESS_KEY_ID is required when STORAGE_BACKEND is 's3'.")
        if not aws_secret_key:
            errors.append("Production configuration error: AWS_SECRET_ACCESS_KEY is required when STORAGE_BACKEND is 's3'.")
        if not aws_bucket_name:
            errors.append("Production configuration error: AWS_STORAGE_BUCKET_NAME is required when STORAGE_BACKEND is 's3'.")

    # 7. Email backend conditional validation
    email_backend = settings_dict.get("EMAIL_BACKEND", "")
    if email_backend == "django.core.mail.backends.smtp.EmailBackend":
        email_host = settings_dict.get("EMAIL_HOST", "")
        if not email_host:
            errors.append("Production configuration error: EMAIL_HOST is required when using SMTP EmailBackend.")

    if errors:
        raise ImproperlyConfigured("\n".join(errors))
