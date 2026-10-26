"""
Management command to configure live internship DataSources.

Usage:
    python manage.py setup_live_sources
"""

from django.core.management.base import BaseCommand
from apps.data_sources.models import DataSource


class Command(BaseCommand):
    help = 'Set up live internship DataSources (Remotive, Arbeitnow)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Configuring live DataSources...'))

        created_or_updated = []

        # 1. Remotive Developer Internships API
        remotive, _ = DataSource.objects.get_or_create(
            name='Remotive API',
            defaults={
                'type': DataSource.Type.API,
                'is_active': True,
                'base_url': 'https://remotive.com/api/remote-jobs?search=intern',
                'description': 'Remotive Public Remote Jobs & Internships API (Free, Real-Time)',
                'config': {
                    'results_path': 'jobs',
                    'field_map': {
                        'title': 'title',
                        'organization_name': 'company_name',
                        'description': 'description',
                        'application_url': 'url',
                        'source_url': 'url',
                        'location_text': 'candidate_required_location',
                        'posted_at': 'publication_date',
                        'required_skills': 'tags',
                        'internship_type': 'job_type',
                    },
                    'timeout_seconds': 30,
                    'max_retries': 3,
                },
            }
        )
        remotive.is_active = True
        remotive.base_url = 'https://remotive.com/api/remote-jobs?search=intern'
        remotive.config = {
            'results_path': 'jobs',
            'field_map': {
                'title': 'title',
                'organization_name': 'company_name',
                'description': 'description',
                'application_url': 'url',
                'source_url': 'url',
                'location_text': 'candidate_required_location',
                'posted_at': 'publication_date',
                'required_skills': 'tags',
                'internship_type': 'job_type',
            },
            'timeout_seconds': 30,
            'max_retries': 3,
        }
        remotive.save()
        created_or_updated.append(remotive.name)

        # 2. Arbeitnow Tech Jobs API
        arbeitnow, _ = DataSource.objects.get_or_create(
            name='Arbeitnow API',
            defaults={
                'type': DataSource.Type.API,
                'is_active': True,
                'base_url': 'https://www.arbeitnow.com/api/job-board-api',
                'description': 'Arbeitnow Tech Jobs & Internships API (Free, Real-Time)',
                'config': {
                    'results_path': 'data',
                    'field_map': {
                        'title': 'title',
                        'organization_name': 'company_name',
                        'description': 'description',
                        'application_url': 'url',
                        'source_url': 'url',
                        'location_text': 'location',
                        'posted_at': 'created_at',
                        'required_skills': 'tags',
                    },
                    'timeout_seconds': 30,
                    'max_retries': 3,
                },
            }
        )
        arbeitnow.is_active = True
        arbeitnow.base_url = 'https://www.arbeitnow.com/api/job-board-api'
        arbeitnow.config = {
            'results_path': 'data',
            'field_map': {
                'title': 'title',
                'organization_name': 'company_name',
                'description': 'description',
                'application_url': 'url',
                'source_url': 'url',
                'location_text': 'location',
                'posted_at': 'created_at',
                'required_skills': 'tags',
            },
            'timeout_seconds': 30,
            'max_retries': 3,
        }
        arbeitnow.save()
        created_or_updated.append(arbeitnow.name)

        # 3. Jobicy Global Tech API
        jobicy, _ = DataSource.objects.get_or_create(
            name='Jobicy API',
            defaults={
                'type': DataSource.Type.API,
                'is_active': True,
                'base_url': 'https://jobicy.com/api/v2/remote-jobs?count=50',
                'description': 'Jobicy Global Remote & Tech Jobs API (Free, Real-Time)',
                'config': {
                    'results_path': 'jobs',
                    'field_map': {
                        'title': 'jobTitle',
                        'organization_name': 'companyName',
                        'description': 'jobDescription',
                        'application_url': 'url',
                        'source_url': 'url',
                        'location_text': 'jobGeo',
                        'posted_at': 'pubDate',
                        'required_skills': 'jobTags',
                        'internship_type': 'jobType',
                    },
                    'timeout_seconds': 30,
                    'max_retries': 3,
                },
            }
        )
        jobicy.is_active = True
        jobicy.base_url = 'https://jobicy.com/api/v2/remote-jobs?count=50'
        jobicy.config = {
            'results_path': 'jobs',
            'field_map': {
                'title': 'jobTitle',
                'organization_name': 'companyName',
                'description': 'jobDescription',
                'application_url': 'url',
                'source_url': 'url',
                'location_text': 'jobGeo',
                'posted_at': 'pubDate',
                'required_skills': 'jobTags',
                'internship_type': 'jobType',
            },
            'timeout_seconds': 30,
            'max_retries': 3,
        }
        jobicy.save()
        created_or_updated.append(jobicy.name)

        for name in created_or_updated:
            self.stdout.write(self.style.SUCCESS(f'  ✓ Configured source: {name}'))

        self.stdout.write(self.style.SUCCESS(f'Successfully set up {len(created_or_updated)} live DataSource(s).'))
