"""
Celery Beat schedule configuration.

This file defines all periodic tasks that should be executed
by Celery Beat on a schedule.
"""

from celery.schedules import crontab

# Celery Beat Schedule
CELERY_BEAT_SCHEDULE = {
    # ==========================================================
    # INTERNSHIP MANAGEMENT
    # ==========================================================
    
    # Expire internships whose deadline has passed
    # Runs daily at midnight UTC (Section 3.10.7 / Task 5.8)
    'expire-internships-daily': {
        'task': 'apps.internships.tasks.expire_internships',
        'schedule': crontab(hour=0, minute=0),  # Daily at 00:00 UTC
    },
    
    # ==========================================================
    # EMBEDDING MAINTENANCE
    # ==========================================================
    
    # Generate missing internship embeddings
    # Runs daily at 2 AM UTC
    'generate-missing-internship-embeddings': {
        'task': 'apps.internships.tasks.generate_missing_internship_embeddings',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM UTC
    },
    
    # Generate missing student embeddings
    # Runs daily at 3 AM UTC
    'generate-missing-student-embeddings': {
        'task': 'apps.students.tasks.generate_missing_student_embeddings',
        'schedule': crontab(hour=3, minute=0),  # Daily at 3 AM UTC
    },
    
    # ==========================================================
    # FUTURE TASKS (for Step 42 and beyond)
    # ==========================================================
    
    # Refresh student recommendations
    # This will be implemented in Step 42 when behavior tracking is added
    # 'refresh-student-recommendations': {
    #     'task': 'apps.internships.tasks.refresh_student_recommendations',
    #     'schedule': crontab(hour=4, minute=0),  # Daily at 4 AM UTC
    # },
    
    # ==========================================================
    # DATA COLLECTION (DataSource pipeline — Task 5.10, Figure 3.8)
    # ==========================================================

    # Collect from public internship APIs every 2 hours
    'collect-api-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(minute=0, hour='*/2'),  # Every 2 hours
        'args': ('api',),
    },

    # Collect from RSS feeds every 6 hours
    'collect-rss-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
        'args': ('rss',),
    },

    # Collect from company career sites daily at 04:00 UTC
    'collect-career-site-data-sources': {
        'task': 'apps.data_sources.tasks.schedule_data_source_collections',
        'schedule': crontab(hour=4, minute=0),
        'args': ('career_site',),
    },

    # ==========================================================
    # CAMPUS LOGISTICS (Track 1 food & housing expiration)
    # ==========================================================
    'expire-campus-logistics-sweep-daily': {
        'task': 'apps.logistics.tasks.expire_campus_logistics_sweep',
        'schedule': crontab(hour=0, minute=0),  # Daily at midnight UTC
    },
}
