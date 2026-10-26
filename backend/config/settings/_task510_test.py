"""
TEMPORARY test settings for verifying Task 5.10 scheduling.

This file uses shortened intervals (minutes instead of hours) to test
that Celery Beat fires scheduled tasks correctly in development.
"""
from .base import *  # noqa: F401,F403
from celery.schedules import crontab

DEBUG = True

ROOT_URLCONF = "config.urls"

import os
os.environ.setdefault("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")

# Disable eager mode for testing actual Celery Beat scheduling
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False

# Shortened Celery Beat schedule for testing (minutes instead of hours)
CELERY_BEAT_SCHEDULE = {
    # Expire internships daily at midnight (keep original)
    'expire-internships-daily': {
        'task': 'apps.internships.tasks.expire_internships',
        'schedule': crontab(hour=0, minute=0),
    },

    # Generate missing internship embeddings daily at 2 AM (keep original)
    'generate-missing-internship-embeddings': {
        'task': 'apps.internships.tasks.generate_missing_internship_embeddings',
        'schedule': crontab(hour=2, minute=0),
    },

    # Generate missing student embeddings daily at 3 AM (keep original)
    'generate-missing-student-embeddings': {
        'task': 'apps.students.tasks.generate_missing_student_embeddings',
        'schedule': crontab(hour=3, minute=0),
    },

    # TEST: Collect from public internship APIs every 2 minutes (shortened from 2 hours)
    'collect-api-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(minute='*/2'),  # Every 2 minutes for testing
        'args': ('api',),
    },

    # TEST: Collect from RSS feeds every 5 minutes (shortened from 6 hours)
    'collect-rss-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes for testing
        'args': ('rss',),
    },

    # TEST: Collect from company career sites every 10 minutes (shortened from daily)
    'collect-career-site-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(minute='*/10'),  # Every 10 minutes for testing
        'args': ('career_site',),
    },
}
