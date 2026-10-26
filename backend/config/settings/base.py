from config.celery_schedule import CELERY_BEAT_SCHEDULE
import dj_database_url
from pathlib import Path
from decouple import Csv, config
from datetime import timedelta
import os

# --------------------------------------------------
# Paths
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# --------------------------------------------------
# Security
# --------------------------------------------------

SECRET_KEY = config("SECRET_KEY")

DEBUG = str(config("DEBUG", default="False")).lower() in (
    "true", "1", "yes", "t", "on", "debug")

# Skip database checks if database is unavailable (for development)
if DEBUG:
    SILENCED_SYSTEM_CHECKS = ['django.E027']  # Skip database connection check

_allowed_hosts_val = config("ALLOWED_HOSTS", default="*")
if _allowed_hosts_val == "*" or _allowed_hosts_val == ["*"]:
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = [h.strip() for h in str(_allowed_hosts_val).split(",") if h.strip()]

# Allow Django test client host (used in automated checks)
if DEBUG:
    ALLOWED_HOSTS = list(ALLOWED_HOSTS) + \
        ["testserver", "localhost", "127.0.0.1"]

# Base URL of the backend used to build absolute verification/reset links
# (e.g. http://localhost:8000 in local dev). Override in deployment.
SITE_BASE_URL = config(
    "SITE_BASE_URL",
    default="http://localhost:8000",
).rstrip("/")

# Base URL of the frontend SPA application
FRONTEND_URL = config(
    "FRONTEND_URL",
    default="http://localhost:5173" if DEBUG else "https://ai-internship-web.onrender.com",
).rstrip("/")

# Recommendation score is expressed on a 0-100 scale. Override this business
# threshold per environment without changing notification task code.
NOTIFICATION_HIGH_SCORE_THRESHOLD = config(
    "NOTIFICATION_HIGH_SCORE_THRESHOLD", default=80, cast=int
)

# --------------------------------------------------
# Trusted company career sites (Task 5.5, Section 3.10.4)
# --------------------------------------------------
# The career-site collector only scrapes hostnames listed here —
# "trusted company websites only". Open/generic scraping is disabled.
# Each allow-listed company also carries its own CSS-selector config,
# which a per-DataSource ``config`` JSON may override.
ALLOWED_CAREER_SITES = {
    # "careers.example.com": {
    #     "container_selector": "li.job",
    #     "field_selectors": {
    #         "title": ".job-title",
    #         "link": "a",
    #         "description": ".description",
    #         "deadline": ".deadline",
    #         "location": ".location",
    #     },
    # },
}

# --------------------------------------------------
# Applications
# --------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

try:
    import daphne
    DJANGO_APPS.insert(0, "daphne")
except ImportError:
    pass

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "drf_spectacular",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_celery_beat",
    # Allauth
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "django.contrib.sites",
    # Django storage backends (Section 7.7.2): filesystem in dev, S3 in prod
    "storages",
]

try:
    import channels
    THIRD_PARTY_APPS.append("channels")
except ImportError:
    pass

try:
    import django_extensions
    THIRD_PARTY_APPS.append("django_extensions")
except ImportError:
    pass


LOCAL_APPS = [
    "apps.accounts",
    "apps.students",
    "apps.internships",
    "apps.recommendations",
    "apps.companies",
    "apps.applications",
    "apps.notifications",
    "apps.analytics",
    "apps.data_sources",
    "apps.administration",
    "apps.common",
    "apps.projects",
    "apps.universities",
    "apps.logistics",
    "apps.uil_profiles",
    "apps.postings",
    "apps.teams",
]

INSTALLED_APPS = (
    DJANGO_APPS
    + THIRD_PARTY_APPS
    + LOCAL_APPS
)

SITE_ID = 1

# --------------------------------------------------
# Middleware
# --------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "config.middleware.AllowMediaFrameEmbedding",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

# --------------------------------------------------
# URL Configuration
# --------------------------------------------------

ROOT_URLCONF = "config.urls"

# --------------------------------------------------
# Templates
# --------------------------------------------------

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [
            BASE_DIR / "templates",
        ],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Performance optimizations for development
if DEBUG:
    # Disable debug toolbar if installed for better performance
    INSTALLED_APPS = [
        app for app in INSTALLED_APPS if 'debug_toolbar' not in app]

# --------------------------------------------------
# WSGI / ASGI
# --------------------------------------------------

WSGI_APPLICATION = "config.wsgi.application"

ASGI_APPLICATION = "config.asgi.application"

# --------------------------------------------------
# Database
# --------------------------------------------------


USE_SQLITE = config("USE_SQLITE", default=False, cast=bool)

_DATABASE_URL = config("DATABASE_URL", default="")
_db_ssl_config = config("DB_SSL_REQUIRE", default="")
if _db_ssl_config != "":
    _db_requires_ssl = _db_ssl_config.lower() in ("true", "1", "yes")
else:
    _db_requires_ssl = (
        bool(_DATABASE_URL)
        and "localhost" not in _DATABASE_URL
        and "127.0.0.1" not in _DATABASE_URL
        and "@db:" not in _DATABASE_URL
        and "@postgres:" not in _DATABASE_URL
        and "internal" not in _DATABASE_URL
    )

if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": dj_database_url.parse(
            _DATABASE_URL,
            conn_max_age=600,
            ssl_require=_db_requires_ssl,
        )
    }

    if "OPTIONS" not in DATABASES["default"]:
        DATABASES["default"]["OPTIONS"] = {}
    DATABASES["default"]["OPTIONS"]["connect_timeout"] = 10

# --------------------------------------------------
# Password Validation
# --------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# --------------------------------------------------
# Internationalization
# --------------------------------------------------

LANGUAGE_CODE = "en"

LANGUAGES = [
    ("en", "English"),
    ("am", "Amharic"),
]

LOCALE_PATHS = [
    BASE_DIR / "locale",
]

TIME_ZONE = config("TIME_ZONE", default="UTC")

USE_I18N = True

USE_TZ = True

# --------------------------------------------------
# Static Files
# --------------------------------------------------

STATIC_URL = "/static/"

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

STATIC_ROOT = BASE_DIR / "staticfiles"

# --------------------------------------------------
# Media Files / Storage (Section 7.7.2)
#
# Django 6 uses the ``STORAGES`` setting. ``default`` (user uploads: resumes,
# CVs) lives on the local filesystem in development and swaps to an
# S3-compatible bucket in production purely via environment variables.
# --------------------------------------------------
STORAGE_BACKEND = config("STORAGE_BACKEND", default="filesystem")

_STORAGES_DEFAULT = {
    "BACKEND": "django.core.files.storage.FileSystemStorage",
    "OPTIONS": {
        "location": BASE_DIR / "media",
        "base_url": "/media/",
    },
}

if STORAGE_BACKEND == "s3":
    # S3-compatible object storage (Section 7.7.2 — django-storages/s3boto3).
    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
    AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="")
    AWS_S3_CUSTOM_DOMAIN = config("AWS_S3_CUSTOM_DOMAIN", default="")
    AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="")
    # Resumes are private: URLs are signed unless a public CDN domain is given.
    AWS_QUERYSTRING_AUTH = config(
        "AWS_QUERYSTRING_AUTH", default=True, cast=bool
    )
    AWS_S3_OBJECT_PARAMETERS = {
        "CacheControl": "max-age=86400",
    }
    # Disable SSL verification for development to handle Backblaze B2 SSL issues
    AWS_S3_VERIFY = config("AWS_S3_VERIFY", default=not DEBUG, cast=bool)

    _STORAGES_DEFAULT = {
        "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        "OPTIONS": {
            "verify": AWS_S3_VERIFY,
        },
    }

STORAGES = {
    "default": _STORAGES_DEFAULT,
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

MEDIA_URL = "/media/"


MEDIA_ROOT = BASE_DIR / "media"

# --------------------------------------------------
# Default Primary Key
# --------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------
# custom user setting
# --------------------------------------------------

AUTH_USER_MODEL = "accounts.User"


# --------------------------------------------------
# Global DRF Settings
# --------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),

    "DEFAULT_PERMISSION_CLASSES": (
        # Authenticated by default (Task 2.4); public endpoints opt out with
        # an explicit AllowAny override (e.g. auth / verification / schema).
        "rest_framework.permissions.IsAuthenticated",
    ),

    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),

    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),

    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",

    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],

    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/day",
        "user": "1000/day",
        "burst": "100/min",
        "sustained": "1000/hour",
    },
}

# drf-spectacular settings
SPECTACULAR_SETTINGS = {
    "TITLE": "AI Internship Platform API",
    "DESCRIPTION": "API for the AI Internship Recommendation Platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api",
    "TAGS": [
        {
            "name": "Authentication",
            "description": "Registration, login, token refresh, email verification, and password management"
        },
        {
            "name": "Student Profile (Phase 3)",
            "description": "Student onboarding and profile sub-resources (me, preferences, resume, skills, interests)"
        },
        {
            "name": "Student Profiles",
            "description": "Full student profile, skill management, and CV upload/status"
        },
        {
            "name": "Internships",
            "description": "Internship listing, search, details, saved internships, and student dashboard"
        },
        {
            "name": "Applications",
            "description": "Student internship applications"
        },
        {
            "name": "Recommendations",
            "description": "AI-powered internship recommendations, history, and feedback"
        },
        {
            "name": "Admin Internships",
            "description": "Admin-only internship management, data sources, collection logs, skills, and dashboard"
        },
        {
            "name": "Companies",
            "description": "Admin-only company management endpoints (Phase 4 Task 4.1)"
        },
        {
            "name": "Admin Data Sources",
            "description": "Admin-only data source management and manual sync (Task 5.10)"
        }
    ],
    "ENUM_NAME_OVERRIDES": {},
}

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5176",
]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "SIGNING_KEY": config("JWT_SECRET", default=SECRET_KEY),
}

EMAIL_BACKEND = config(
    "EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")

EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = config("EMAIL_PORT", default=465, cast=int)

EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")

# Port 465 uses SSL, Port 587 uses TLS (mutually exclusive in Django)
_default_use_ssl = (EMAIL_PORT == 465)
_default_use_tls = (EMAIL_PORT == 587)

EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=_default_use_ssl, cast=bool)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=False if EMAIL_USE_SSL else _default_use_tls, cast=bool)

EMAIL_TIMEOUT = config(
    "EMAIL_TIMEOUT",
    default=15,
    cast=int,
)

DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default=EMAIL_HOST_USER or "noreply@ai-internship.com",
)
SERVER_EMAIL = DEFAULT_FROM_EMAIL

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# --------------------------------------------------
# Allauth (email + Google OAuth social login)
# --------------------------------------------------
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapter.CustomSocialAccountAdapter"
ACCOUNT_ADAPTER = "apps.accounts.adapter.CustomAccountAdapter"

# After a successful allauth (social) login, redirect to the SPA callback
# route carrying the minted JWT tokens. This reuses our custom adapter.
LOGIN_REDIRECT_URL = config("LOGIN_REDIRECT_URL", default="/auth/callback")

# URL the frontend considers the OAuth callback (with query params appended).
FRONTEND_OAUTH_CALLBACK_URL = config(
    "FRONTEND_OAUTH_CALLBACK_URL",
    default="http://localhost:5173/auth/callback" if DEBUG else "/auth/callback",
)

ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_UNIQUE_EMAIL = True

# Google has already verified the email at consent time, so skip the
# intermediate "confirm your email" step for social logins.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_LOGIN_ON_GET = True

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APPS": [
            {
                "client_id": config("GOOGLE_CLIENT_ID", default=""),
                "secret": config("GOOGLE_CLIENT_SECRET", default=""),
                "key": "",
            },
        ],
        "SCOPE": [
            "profile",
            "email",
        ],
        "AUTH_PARAMS": {
            "access_type": "online",
        },
        "EMAIL_AUTHENTICATION": True,
    },
}

CELERY_BEAT_SCHEDULER = (
    "django_celery_beat.schedulers:DatabaseScheduler"
)

# Import Celery Beat schedule

# Redis URLs are env-driven so docker-compose (6380) and local native
# services (6379) can both work without code changes (Phase 0 Task 0.2/0.3).
CELERY_BROKER_URL = config(
    "CELERY_BROKER_URL",
    default="redis://127.0.0.1:6379/0",
)

CELERY_RESULT_BACKEND = config(
    "CELERY_RESULT_BACKEND",
    default="redis://127.0.0.1:6379/1",
)

CELERY_ACCEPT_CONTENT = [
    "json",
]

CELERY_TASK_SERIALIZER = "json"

CELERY_RESULT_SERIALIZER = "json"

CELERY_TIMEZONE = "UTC"

CELERY_ENABLE_UTC = True

CELERY_TASK_TIME_LIMIT = 30 * 60

CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60

# Phase 3 Task 3.5 — run Celery tasks synchronously (no broker). Used in dev
# and tests via ``CELERY_TASK_ALWAYS_EAGER=True`` (env-driven); the full broker
# wiring lands in Phase 5.
CELERY_TASK_ALWAYS_EAGER = config(
    "CELERY_TASK_ALWAYS_EAGER",
    default=False,
    cast=bool,
)

# Propagate task exceptions in eager mode so failures surface in tests/dev.
CELERY_TASK_EAGER_PROPAGATES = config(
    "CELERY_TASK_EAGER_PROPAGATES",
    default=True,
    cast=bool,
)

_redis_url = config("REDIS_URL", default="")
if _redis_url and not _redis_url.startswith("locmem"):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [_redis_url],
            },
        },
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "ai-internship-locmem-cache",
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

SEMANTIC_MATCH_WEIGHT = 0.40

PREFERENCE_MATCH_WEIGHT = 0.60

CV_MATCH_WEIGHT = 0.20


OPENAI_API_KEY = config(
    "OPENAI_API_KEY",
    default=None,
)
