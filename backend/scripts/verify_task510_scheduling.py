"""
Verification script for Task 5.10 — Scheduling (Celery Beat, Section 3.10.1,
Figure 3.8).

Checks (all DB work is rolled back so the dev database is left clean):
1. ``CELERY_BEAT_SCHEDULE`` defines the periodic entries:
   - API collection every N hours
   - RSS collection every N hours
   - daily expiry check
2. The crontab intervals match the spec (API every 2h, RSS every 6h,
   expiry daily at 00:00).
3. The manual admin trigger ``POST /api/admin/data-sources/<id>/sync-now/``
   queues the very same ``collect_data_source`` task the periodic fan-out
   uses, and does so immediately.
4. ``schedule_data_source_collections`` fans out to every active source of
   the requested type only (mirror of the beat args).
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from unittest import mock
from django.db import transaction
from django.test import Client

from config.celery_schedule import CELERY_BEAT_SCHEDULE
from apps.data_sources.models import DataSource
from apps.data_sources.tasks import schedule_data_source_collections
from apps.accounts.models import User

from rest_framework.test import APIClient


def run_checks():
    print("=" * 60)
    print("TASK 5.10 VERIFICATION: Scheduling (Celery Beat)")
    print("=" * 60)

    passed = 0
    total = 0

    def check(desc, condition):
        nonlocal passed, total
        total += 1
        if condition:
            print(f"  [PASS] {desc}")
            passed += 1
        else:
            print(f"  [FAIL] {desc}")
            raise AssertionError(f"Check failed: {desc}")

    # ------------------------------------------------------------------
    # 1. Periodic entries exist in CELERY_BEAT_SCHEDULE
    # ------------------------------------------------------------------
    for key, task, desc in (
        ("collect-api-data-sources",
         "apps.data_sources.tasks.schedule_data_source_collections",
         "API collection entry"),
        ("collect-rss-data-sources",
         "apps.data_sources.tasks.schedule_data_source_collections",
         "RSS collection entry"),
        ("expire-internships-daily",
         "apps.internships.tasks.expire_internships",
         "Expiry check entry"),
    ):
        entry = CELERY_BEAT_SCHEDULE.get(key)
        check(f"{desc} present in schedule", entry is not None)
        check(f"{desc} targets correct task",
              entry is not None and entry["task"] == task)

    # ------------------------------------------------------------------
    # 2. Crontab intervals match the spec
    # ------------------------------------------------------------------
    api_entry = CELERY_BEAT_SCHEDULE["collect-api-data-sources"]
    check("API collection every 2 hours",
          api_entry["schedule"].hour ==
          {0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22}
          and api_entry["schedule"].minute == {0})
    check("API beat args restrict to 'api'",
          api_entry["args"] == ("api",))

    rss_entry = CELERY_BEAT_SCHEDULE["collect-rss-data-sources"]
    check("RSS collection every 6 hours",
          rss_entry["schedule"].hour == {0, 6, 12, 18}
          and rss_entry["schedule"].minute == {0})
    check("RSS beat args restrict to 'rss'",
          rss_entry["args"] == ("rss",))

    expiry_entry = CELERY_BEAT_SCHEDULE["expire-internships-daily"]
    check("Expiry check runs daily at 00:00",
          expiry_entry["schedule"].hour == {0}
          and expiry_entry["schedule"].minute == {0})

    with transaction.atomic():
        # ------------------------------------------------------------------
        # 3. Periodic fan-out queues every active source of the type
        # ------------------------------------------------------------------
        api_active = DataSource.objects.create(
            name="Sched Verify API",
            type=DataSource.Type.API,
            base_url="https://v.example.com/api",
        )
        api_inactive = DataSource.objects.create(
            name="Sched Verify Inactive API",
            type=DataSource.Type.API,
            base_url="https://v.example.com/api/inactive",
            is_active=False,
        )
        rss_active = DataSource.objects.create(
            name="Sched Verify RSS",
            type=DataSource.Type.RSS,
            base_url="https://v.example.com/feed.xml",
        )

        with mock.patch(
            "apps.data_sources.tasks.collect_data_source.delay"
        ) as delay:
            result = schedule_data_source_collections.run("api")

            check("fan-out reports exactly 1 active API source queued",
                  result["sources_queued"] == 1)
            queued_ids = [c.args[0] for c in delay.call_args_list]
            check("fan-out queues the active API source only",
                  queued_ids == [api_active.pk])

        # ------------------------------------------------------------------
        # 4. Manual admin trigger fires the same task immediately
        # ------------------------------------------------------------------
        admin = User.objects.create_superuser(
            email="sched-admin@example.com",
            password="adminpass123",
        )
        admin_client = APIClient()
        admin_client.force_authenticate(user=admin)

        with mock.patch(
            "apps.data_sources.views.collect_data_source.delay"
        ) as delay:
            response = admin_client.post(
                f"/api/admin/data-sources/{api_active.pk}/sync-now/",
                format="json",
            )

            check("manual trigger returns 202 Accepted",
                  response.status_code == 202)
            check("manual trigger returns queued status",
                  response.data.get("status") == "queued")
            check("manual trigger queues same task with source id",
                  delay.call_args_list == [mock.call(api_active.pk)])

        transaction.set_rollback(True)

    check("seeded rows rolled back after verification",
          DataSource.objects.filter(
              name__startswith="Sched Verify"
          ).count() == 0)

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
