from django.core.management.base import BaseCommand
from apps.data_sources.models import DataSource
from apps.data_sources.tasks import collect_data_source
from apps.internships.models import Internship


class Command(BaseCommand):
    help = "Fetches live internships from registered data sources and publishes them."

    def add_arguments(self, parser):
        parser.add_argument(
            "--auto-publish",
            action="store_true",
            default=True,
            help="Automatically set fetched draft listings to published.",
        )

    def handle(self, *args, **options):
        sources = DataSource.objects.filter(is_active=True)
        if not sources.exists():
            self.stdout.write(self.style.WARNING("No active DataSource found."))
            return

        self.stdout.write(self.style.NOTICE(f"Found {sources.count()} active DataSources. Starting sync..."))

        for source in sources:
            self.stdout.write(f"Syncing: {source.name} ({source.base_url})...")
            result = collect_data_source(source.id)
            self.stdout.write(self.style.SUCCESS(f"Result for {source.name}: {result}"))

        if options.get("auto_publish"):
            updated = Internship.objects.filter(status=Internship.STATUS_DRAFT).update(
                status=Internship.STATUS_ACTIVE, is_verified=True, needs_review=False
            )
            self.stdout.write(self.style.SUCCESS(f"Published {updated} newly fetched listings."))

        self.stdout.write(
            self.style.SUCCESS(
                f"Sync complete! Total live internships in DB: {Internship.objects.count()}"
            )
        )
