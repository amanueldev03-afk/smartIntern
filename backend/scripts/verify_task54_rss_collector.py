"""
Verification script for Task 5.4 — RSS collector (Section 3.10.3).

Checks:
1. RSSAdapter (data_sources/adapters/rss.py) is feedparser-based and
   implements the BaseAdapter contract.
2. Fed a sample RSS XML fixture, it extracts the correct title / link /
   description per item (plus guid -> external_id, pubDate -> posted_at).
3. Normalized feed items carry the full Task 1.5 schema, so they can
   flow through the same normalize -> validate -> dedupe -> store
   pipeline as every other per-source adapter.
"""
import os
import sys
import django
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.data_sources.models import DataSource
from apps.data_sources.adapters import (
    BaseAdapter,
    RSSAdapter,
    SCHEMA_FIELDS,
)
from apps.data_sources.tests import FakeResponse, RSS_FIXTURE

REQUEST_MODULE = "apps.data_sources.adapters.http.requests"
SLEEP_MODULE = "apps.data_sources.adapters.http.time"


def run_checks():
    print("=" * 60)
    print("TASK 5.4 VERIFICATION: RSS collector")
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
        name="Sample Internship Feed",
        type=DataSource.Type.RSS,
        base_url="https://feeds.example.com/internships",
    )
    adapter = RSSAdapter(source)

    check(
        "rss.py implements BaseAdapter",
        issubclass(RSSAdapter, BaseAdapter),
    )
    check(
        "RSSAdapter has no unimplemented abstract methods",
        RSSAdapter.__abstractmethods__ == set(),
    )

    with patch(f"{REQUEST_MODULE}.get") as mock_get, patch(
        f"{SLEEP_MODULE}.sleep"
    ):
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=RSS_FIXTURE.encode("utf-8"),
        )
        raw_listings = adapter.fetch()
        normalized_records = [
            adapter.normalize(raw) for raw in raw_listings
        ]

    expected = [
        {
            "title": "Software Engineering Intern",
            "link": "https://careers.example.com/jobs/1",
            "description": "Build backend services with Django.",
        },
        {
            "title": "Acme Corp - Data Science Intern",
            "link": "https://careers.example.com/jobs/2",
            "description": "Analyze user behaviour data.",
        },
        {
            "title": "Design Intern",
            "link": "https://careers.example.com/jobs/3",
            "description": "Create user interfaces.",
        },
    ]

    check("fixture yields 3 feed items", len(raw_listings) == 3)
    for i, (raw, want) in enumerate(
        zip(raw_listings, expected), start=1
    ):
        check(f"item {i} title extracted", raw["title"] == want["title"])
        check(f"item {i} link extracted", raw["application_url"] == want["link"])
        check(
            f"item {i} description extracted",
            raw["description"] == want["description"],
        )

    check(
        "item 1 guid -> external_id",
        raw_listings[0]["external_id"]
        == "https://feeds.example.com/jobs/1",
    )
    check(
        "item 1 pubDate -> posted_at",
        raw_listings[0]["posted_at"]
        == "Mon, 03 Aug 2026 09:00:00 GMT",
    )
    check(
        "company extracted from 'Acme Corp - ...' title",
        normalized_records[1]["organization_name"] == "Acme Corp",
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