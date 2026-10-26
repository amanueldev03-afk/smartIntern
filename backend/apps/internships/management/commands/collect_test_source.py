from django.core.management.base import BaseCommand

from apps.internships.models import InternshipSource
from apps.internships.services.collector import (
    InternshipCollector,
)
from apps.internships.services.adapters.test_source import (
    TestInternshipAdapter,
)


class Command(BaseCommand):
    help = "Collect internships from the test source."

    def handle(self, *args, **options):

        source, _ = (
            InternshipSource.objects.get_or_create(
                name="Test Internship Source",
                defaults={
                    "source_type": "api",
                    "website_url": (
                        "https://example.com"
                    ),
                    "description": (
                        "Development testing source."
                    ),
                    "is_active": True,
                },
            )
        )

        adapter = TestInternshipAdapter(source)

        records = adapter.fetch()

        collector = InternshipCollector(source)

        log = collector.collect(records)

        self.stdout.write(
            self.style.SUCCESS(
                "Collection completed."
            )
        )

        self.stdout.write(
            f"Status: {log.status}"
        )

        self.stdout.write(
            f"Found: {log.records_found}"
        )

        self.stdout.write(
            f"Created: {log.records_created}"
        )

        self.stdout.write(
            f"Updated: {log.records_updated}"
        )

        self.stdout.write(
            f"Failed: {log.records_failed}"
        )