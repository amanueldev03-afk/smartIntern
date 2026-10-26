from django.core.management.base import BaseCommand

from apps.internships.models import Internship


class Command(BaseCommand):
    help = "Mark expired internships as expired."

    def handle(self, *args, **options):

        internships = Internship.objects.filter(
            status="active",
            application_deadline__isnull=False,
        )

        expired_count = 0

        for internship in internships:

            if internship.expire_if_needed():
                expired_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"{expired_count} internship(s) expired."
            )
        )