"""
apps/data_sources/management/commands/seed_beat_schedule.py

Populate the ``django_celery_beat`` database-driven periodic task table from
the static ``CELERY_BEAT_SCHEDULE`` dict (Task 5.10, Section 3.10.1 /
Figure 3.8).

``settings.CELERY_BEAT_SCHEDULER`` is
``django_celery_beat.schedulers:DatabaseScheduler``, so Celery Beat reads its
schedule from the database rather than the dict. This command seeds that DB
from the dict so the periodic entries (API every N hours, RSS every N hours,
daily expiry check) are actually scheduled without hand-editing the admin.

Usage:
    python manage.py seed_beat_schedule
    python manage.py seed_beat_schedule --enabled    # enable all by default
    python manage.py seed_beat_schedule --update     # update existing rows
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import (
    CrontabSchedule,
    PeriodicTask,
)

from config.celery_schedule import CELERY_BEAT_SCHEDULE


class Command(BaseCommand):
    help = "Seed django_celery_beat with the CELERY_BEAT_SCHEDULE entries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing periodic tasks that have already been seeded.",
        )

    def _resolve_crontab(self, crontab):
        defaults = {
            "minute": "*",
            "hour": "*",
            "day_of_week": "*",
            "day_of_month": "*",
            "month_of_year": "*",
        }
        for field in defaults:
            value = getattr(crontab, field)
            if isinstance(value, (set, frozenset, list, tuple)):
                value = ",".join(str(v) for v in sorted(value))
            defaults[field] = value

        schedule, _ = CrontabSchedule.objects.get_or_create(**defaults)
        return schedule

    def handle(self, *args, **options):
        update = options["update"]
        created_count = 0
        updated_count = 0

        for name, entry in CELERY_BEAT_SCHEDULE.items():
            crontab_schedule = self._resolve_crontab(entry["schedule"])

            existing = PeriodicTask.objects.filter(name=name).first()
            if existing is not None:
                if not update:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Periodic task '{name}' already exists (skip)."
                        )
                    )
                    continue
                existing.crontab = crontab_schedule
                existing.task = entry["task"]
                existing.args = list(entry.get("args", []))
                existing.save()
                updated_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Updated periodic task '{name}'.")
                )
                continue

            PeriodicTask.objects.create(
                name=name,
                task=entry["task"],
                crontab=crontab_schedule,
                args=list(entry.get("args", [])),
                enabled=True,
            )
            created_count += 1
            self.stdout.write(
                self.style.SUCCESS(f"Created periodic task '{name}'.")
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done — created {created_count}, updated {updated_count} "
                f"periodic task(s)."
            )
        )
