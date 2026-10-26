"""
Verification script for Task 5.8 — Expired internship detection
(Section 3.10.7).

Checks (all DB work is rolled back to keep the dev database clean):
1. Celery Beat runs the expiration task DAILY at 00:00 UTC.
2. ``expire_internships`` flips active internships whose deadline is
   strictly before today onto the ``expired`` status.
3. A seeded internship with yesterday's deadline: appears in Phase 4's
   "active" search results before the run and disappears after it.
4. Future-deadline and non-active internships are left untouched.
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from config.celery_schedule import CELERY_BEAT_SCHEDULE
from apps.internships.models import (
    Internship,
    InternshipSource,
)
from apps.internships.tasks import expire_internships


def active_search_queryset():
    """Mirror of Phase 4's InternshipListView queryset."""
    now = timezone.now()
    return Internship.objects.filter(
        status=Internship.STATUS_ACTIVE,
        is_verified=True,
    ).filter(
        Q(application_deadline__isnull=True)
        | Q(application_deadline__gt=now)
    )


def run_checks():
    print("=" * 60)
    print("TASK 5.8 VERIFICATION: Expired internship detection")
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

    beat = CELERY_BEAT_SCHEDULE.get("expire-internships-daily")
    check("Celery Beat has a daily expire-internships entry",
          beat is not None)
    check("beat entry targets expire_internships task",
          beat["task"] == "apps.internships.tasks.expire_internships")
    check("beat entry schedules a once-daily run (00:00)",
          beat["schedule"].minute == {0}
          and beat["schedule"].hour == {0})

    with transaction.atomic():
        source = InternshipSource.objects.create(
            name="Task 5.8 Verify Source",
            source_type="api",
        )

        today = timezone.localdate()
        yesterday = today - timezone.timedelta(days=1)
        future = today + timezone.timedelta(days=30)

        expired = Internship.objects.create(
            title="Yesterday Deadline Intern",
            organization_name="Example Corp",
            description="Expires today.",
            application_url="https://example.com/apply/yesterday",
            source=source,
            external_id="verify58-expired",
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            deadline=yesterday,
        )
        future_ok = Internship.objects.create(
            title="Future Deadline Intern",
            organization_name="Example Corp",
            description="Stays active.",
            application_url="https://example.com/apply/future",
            source=source,
            external_id="verify58-future",
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            deadline=future,
        )
        past_draft = Internship.objects.create(
            title="Past Deadline Draft",
            organization_name="Example Corp",
            description="Not active.",
            application_url="https://example.com/apply/draft",
            source=source,
            external_id="verify58-draft",
            status=Internship.STATUS_DRAFT,
            is_verified=False,
            deadline=yesterday,
        )

        check("yesterday-deadline listing IS in active search results",
              active_search_queryset().filter(pk=expired.pk).count() == 1)

        result = expire_internships()

        check("task reports exactly 1 expired listing",
              result["expired_count"] == 1)

        expired.refresh_from_db()
        check("yesterday-deadline listing status flips to expired",
              expired.status == Internship.STATUS_EXPIRED)

        check("expired listing disappears from active search results",
              active_search_queryset().filter(pk=expired.pk).count() == 0)

        future_ok.refresh_from_db()
        check("future-deadline listing stays active",
              future_ok.status == Internship.STATUS_ACTIVE)

        past_draft.refresh_from_db()
        check("past-deadline non-active listing is untouched",
              past_draft.status == Internship.STATUS_DRAFT)

        transaction.set_rollback(True)

    check("seeded rows rolled back after verification",
          InternshipSource.objects.filter(
              name="Task 5.8 Verify Source"
          ).count() == 0)

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()