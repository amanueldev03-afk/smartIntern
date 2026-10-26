from .base import *

DEBUG = True

# Force filesystem storage in development to avoid S3/Backblaze SSL issues
STORAGE_BACKEND = "filesystem"

# Relax throttling in development to prevent 429 lockouts during local testing
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "100000/day",
    "user": "100000/day",
    "burst": "10000/min",
    "sustained": "100000/hour",
}