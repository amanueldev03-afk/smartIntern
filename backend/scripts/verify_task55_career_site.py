"""
Verification script for Task 5.5 — Company career-site collector
(Section 3.10.4).

Checks:
1. CareerSiteAdapter only scrapes hostnames on the explicit
   ``ALLOWED_CAREER_SITES`` allow-list ("trusted company websites
   only") — non-allow-listed hosts are refused with PermissionError
   and no HTTP request is made.
2. Per-company CSS-selector config drives extraction: feeding a saved
   HTML fixture yields the correct title / description / deadline
   (and link) per listing without hitting any live site.
3. Career-site listings normalize onto the Task 1.5 schema.
"""
import os
import sys
import django
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test.utils import override_settings

from apps.data_sources.models import DataSource
from apps.data_sources.adapters import (
    BaseAdapter,
    CareerSiteAdapter,
    SCHEMA_FIELDS,
)
from apps.data_sources.tests import (
    ALLOWED_CAREER_SITES,
    CAREER_SITE_FIXTURE,
    FakeResponse,
)

REQUEST_MODULE = "apps.data_sources.adapters.http.requests"
SLEEP_MODULE = "apps.data_sources.adapters.http.time"


def run_checks():
    print("=" * 60)
    print("TASK 5.5 VERIFICATION: Company career-site collector")
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

    source = DataSource(
        name="Example Corp Careers",
        type=DataSource.Type.CAREER_SITE,
        base_url="https://careers.example.com/jobs",
        config={},
    )
    adapter = CareerSiteAdapter(source)

    check(
        "career_site.py implements BaseAdapter",
        issubclass(CareerSiteAdapter, BaseAdapter),
    )
    check(
        "CareerSiteAdapter has no unimplemented abstract methods",
        CareerSiteAdapter.__abstractmethods__ == set(),
    )

    # Allow-list enforcement: non-allow-listed host is refused.
    with override_settings(ALLOWED_CAREER_SITES={}):
        with patch(f"{REQUEST_MODULE}.get") as mock_get:
            refused = False
            try:
                adapter.fetch()
            except PermissionError:
                refused = True

        check("non-allow-listed host is refused", refused)
        check(
            "no HTTP request made for refused host",
            mock_get.call_count == 0,
        )

    # Fixture extraction for one allow-listed company config.
    with override_settings(ALLOWED_CAREER_SITES=ALLOWED_CAREER_SITES):
        with patch(f"{REQUEST_MODULE}.get") as mock_get, patch(
            f"{SLEEP_MODULE}.sleep"
        ):
            mock_get.return_value = FakeResponse(
                status_code=200,
                content=CAREER_SITE_FIXTURE.encode("utf-8"),
            )
            raw_listings = adapter.fetch()
            normalized_records = [
                adapter.normalize(raw) for raw in raw_listings
            ]

    check("fixture yields 2 job listings", len(raw_listings) == 2)

    first = raw_listings[0]
    check("title extracted", first["title"] == "Software Engineering Intern")
    check(
        "description extracted",
        first["description"] == "Build backend services with Django.",
    )
    check("deadline extracted", first["application_deadline"] == "2026-12-31")
    check(
        "relative link resolved against base_url",
        first["application_url"]
        == "https://careers.example.com/jobs/software-engineering-intern",
    )

    for i, record in enumerate(normalized_records, start=1):
        check(
            f"normalized record {i} has all Task 1.5 fields "
            f"({len(record)}/{len(SCHEMA_FIELDS)})",
            set(record.keys()) == set(SCHEMA_FIELDS),
        )
        check(
            f"normalized record {i} enters pipeline as draft",
            record["status"] == "draft"
            and record["is_verified"] is False,
        )

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()