from .base import *

DEBUG = True

# Disable throttling during automated tests so anonymous/anonymous-heavy test
# suites do not trip the AnonRateThrottle (100/day) budget mid-run.
#
# DEFAULT_THROTTLE_CLASSES is cleared so the global default never throttles.
# We keep DEFAULT_THROTTLE_RATES populated (effectively unlimited) because
# several views (e.g. LoginView) explicitly set ``AnonRateThrottle`` in their
# ``throttle_classes``; an AnonRateThrottle with no configured rate raises
# ImproperlyConfigured at request time.
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "1000000/day",
    "user": "1000000/day",
    "burst": "1000000/min",
    "sustained": "1000000/hour",
}

# Capture emails in-memory (django.core.mail.outbox) for round-trip tests.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Tests must not contact an external object-storage service just to exercise
# upload and profile business logic.
STORAGE_BACKEND = "filesystem"
STORAGES["default"] = {
    "BACKEND": "django.core.files.storage.FileSystemStorage",
    "OPTIONS": {
        "location": BASE_DIR / "media",
        "base_url": "/media/",
    },
}

# Phase 3 Task 3.5 — run Celery tasks synchronously during tests so the
# resume-parsing pipeline can be verified without a live broker/Redis.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
