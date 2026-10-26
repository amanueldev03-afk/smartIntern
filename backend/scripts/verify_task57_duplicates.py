"""
Verification script for Task 5.7 — Duplicate detection (Section 3.10.6).

Checks (all DB work is rolled back to keep the dev database clean):
1. ``normalize_listing`` computes ``content_hash`` = sha256 of
   title + company + application_url, deterministically.
2. Feeding the SAME listing twice -> exactly 1 Internship row; the
   second feed is classified ``duplicate``, skipped, and bumps
   ``last_seen_at`` on the existing row instead.
3. Feeding a NEAR-DUPLICATE (same company, reworded title) -> no new
   row and no merge; a pending ``InternshipDuplicateFlag`` for admin
   review is created with the rapidfuzz similarity score.
4. Repeated near-duplicates refresh the existing pending flag rather
   than stacking duplicates.
5. A genuinely distinct listing is stored as a new row.
"""
import os
import sys
import django
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import transaction
from django.utils import timezone

from apps.internships.models import (
    Internship,
    InternshipDuplicateFlag,
)
from apps.data_sources.services.normalization import (
    compute_content_hash,
    normalize_listing,
)
from apps.data_sources.services.dedupe import (
    DEDUPE_FUZZY_THRESHOLD,
    find_exact_duplicate,
    find_near_duplicate,
    store_listing,
)


def make_listing(title="Python Backend Intern", company="Example Corp",
                 app_url="https://example.com/apply/backend", **overrides):
    raw = {
        "external_id": "DD-001",
        "title": title,
        "organization_name": company,
        "description": "Backend internship description.",
        "category": "Software Engineering",
        "country": "Ethiopia",
        "city": "Addis Ababa",
        "location_text": "Addis Ababa",
        "internship_type": "remote",
        "work_type": "full_time",
        "compensation_type": "paid",
        "minimum_compensation": 300,
        "maximum_compensation": 600,
        "compensation_currency": "USD",
        "compensation_period": "monthly",
        "required_skills": [],
        "preferred_skills": [],
        "duration_min_weeks": 8,
        "duration_max_weeks": 16,
        "application_url": app_url,
        "source_url": app_url,
        "posted_at": "2026-08-01T10:00:00Z",
        "application_deadline": "2026-09-30T23:59:59Z",
    }
    raw.update(overrides)
    return normalize_listing(raw, source_type="api")


def run_checks():
    print("=" * 60)
    print("TASK 5.7 VERIFICATION: Duplicate detection")
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

    with transaction.atomic():
        listing = make_listing()

        check("normalize computes 64-hex content_hash",
              isinstance(listing["content_hash"], str)
              and len(listing["content_hash"]) == 64)
        check("content_hash deterministic for identical input",
              listing["content_hash"] == make_listing()["content_hash"])
        check("content_hash derived from title+company+url",
              listing["content_hash"] == compute_content_hash(
                  "Python Backend Intern",
                  "Example Corp",
                  "https://example.com/apply/backend",
              ))

        tz = timezone.get_current_timezone()
        first_now = datetime(2026, 8, 1, tzinfo=tz)
        second_now = datetime(2026, 8, 15, tzinfo=tz)

        first = store_listing(listing, now=first_now)
        check("first feed creates a row", first.action == "created")

        second = store_listing(listing, now=second_now)
        check("same listing twice -> exact duplicate",
              second.action == "duplicate"
              and second.internship.pk == first.internship.pk)

        check("exact duplicate skips the insert (only 1 DB row)",
              Internship.objects.count() == 1)

        row = Internship.objects.get()
        check("exact duplicate updates last_seen_at on existing row",
              row.last_seen_at == second_now)

        check("find_exact_duplicate returns the stored row",
              find_exact_duplicate(listing["content_hash"]) is not None)

        near = make_listing(
            title="Python Backend Internship",
            app_url="https://example.com/apply/backend-2",
        )

        matched, score = find_near_duplicate(near)
        check("near-duplicate found via fuzzy title + same company",
              matched is not None and matched.pk == row.pk)
        check("fuzzy score at/above threshold",
              score is not None and score >= DEDUPE_FUZZY_THRESHOLD)

        result = store_listing(near)
        check("near-duplicate is flagged, not silently merged",
              result.action == "near_duplicate")

        check("near-duplicate is not silently duplicated",
              Internship.objects.count() == 1)

        flag = InternshipDuplicateFlag.objects.get()
        check("pending admin-review flag created with score",
              flag.review_status == "pending"
              and flag.internship.pk == row.pk
              and flag.similarity_score >= DEDUPE_FUZZY_THRESHOLD)

        store_listing(near)
        check("repeated near-duplicate refreshes one flag",
              InternshipDuplicateFlag.objects.count() == 1)

        other = make_listing(
            title="Data Science Intern",
            company="Another Org",
            app_url="https://other.example.com/apply/1",
        )
        created = store_listing(other)
        check("distinct listing stored as a new row",
              created.action == "created"
              and Internship.objects.count() == 2)

        transaction.set_rollback(True)

    check("DB rows rolled back after verification",
          Internship.objects.filter(
              organization_name__in=["Example Corp", "Another Org"]
          ).count() == 0
          and InternshipDuplicateFlag.objects.count() == 0)

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()