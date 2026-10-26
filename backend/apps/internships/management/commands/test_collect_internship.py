from django.core.management.base import BaseCommand

from apps.internships.models import InternshipSource
from apps.internships.services.collector import (
    InternshipCollector,
)


class Command(BaseCommand):
    help = "Test internship collection."

    def handle(self, *args, **options):

        source, created = InternshipSource.objects.get_or_create(
            name="Test Internship Source",
            defaults={
                "source_type": "api",
                "website_url": "https://example.com",
                "description": (
                    "Development testing source."
                ),
                "is_active": True,
            },
        )

        data = {
            "external_id": "TEST-001",

            "title": "Python Backend Intern",

            "organization_name": (
                "Example Technology"
            ),

            "description": (
                "Backend development internship "
                "for students."
            ),

            "category": "Software Engineering",

            "country": "Ethiopia",

            "city": "Addis Ababa",

            "location_text": "Addis Ababa",

            "internship_type": "remote",

            "work_type": "part_time",

            "compensation_type": "paid",

            "minimum_compensation": 300,

            "maximum_compensation": 600,

            "compensation_currency": "USD",

            "compensation_period": "monthly",

            "required_skills": [
                "Python",
                "Django",
                "PostgreSQL",
            ],

            "preferred_skills": [
                "Docker",
                "REST API",
            ],

            "duration_min_weeks": 8,

            "duration_max_weeks": 16,

            "application_url": (
                "https://example.com/apply"
            ),

            "source_url": (
                "https://example.com/internships/"
                "TEST-001"
            ),
        }

        collector = InternshipCollector(source)

        internship, created = collector.collect(data)

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    "Internship created successfully."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "Existing internship updated successfully."
                )
            )

        self.stdout.write(
            f"ID: {internship.id}"
        )

        self.stdout.write(
            f"Title: {internship.title}"
        )

        self.stdout.write(
            f"Status: {internship.status}"
        )

        self.stdout.write(
            f"Verified: {internship.is_verified}"
        )