"""
Verification script for Task 5.3 — API collector (Section 3.10.2).

Checks:
1. APIAdapter lives at data_sources/adapters/api_adapter.py, implements
   BaseAdapter, and maps external fields (title, company_name,
   description, skills, application_url, deadline) onto the internal
   Task 1.5 schema.
2. Pointed at a mock endpoint returning 5 listings, it produces 5
   normalized records with no missing required fields.
3. Rate limits are respected (Section 2.8): exponential-backoff retry
   on transient failures, honouring the Retry-After header.
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
    APIAdapter,
    BaseAdapter,
    SCHEMA_FIELDS,
)
from apps.data_sources.tests import FakeResponse, mock_listing

REQUEST_MODULE = (
    "apps.data_sources.adapters.http.requests"
)
SLEEP_MODULE = "apps.data_sources.adapters.http.time"

REQUIRED_INTERNAL_FIELDS = [
    "external_id",
    "title",
    "organization_name",
    "description",
    "required_skills",
    "application_url",
    "application_deadline",
]


def run_checks():
    print("=" * 60)
    print("TASK 5.3 VERIFICATION: API collector")
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
        name="Mock Internship API",
        type=DataSource.Type.API,
        base_url="https://mock-api.example.com/internships",
        config={"results_path": "jobs"},
    )
    adapter = APIAdapter(source)

    # Check 1: file/module contract.
    check(
        "api_adapter.py implements BaseAdapter",
        issubclass(APIAdapter, BaseAdapter),
    )
    check(
        "APIAdapter has no unimplemented abstract methods",
        APIAdapter.__abstractmethods__ == set(),
    )

    # Check 2: mock endpoint returns 5 listings -> 5 normalized records.
    with patch(f"{REQUEST_MODULE}.get") as mock_get, patch(
        f"{SLEEP_MODULE}.sleep"
    ):
        mock_get.return_value = FakeResponse(
            status_code=200,
            payload={"jobs": [mock_listing(i) for i in range(1, 6)]},
        )

        raw_listings = adapter.fetch()
        normalized_records = [
            adapter.normalize(raw) for raw in raw_listings
        ]

    check(
        "fetch() on mock endpoint returns 5 listings",
        len(raw_listings) == 5,
    )
    check(
        "5 normalized records are produced",
        len(normalized_records) == 5,
    )
    for i, record in enumerate(normalized_records, start=1):
        check(
            f"normalized record {i} has all Task 1.5 fields "
            f"({len(record)}/{len(SCHEMA_FIELDS)})",
            set(record.keys()) == set(SCHEMA_FIELDS),
        )
        check(
            f"normalized record {i} has no missing required fields",
            all(
                record[field]
                for field in REQUIRED_INTERNAL_FIELDS
            ),
        )

    # External field mapping (company_name/skills/deadline).
    first = normalized_records[0]
    check(
        "company_name -> organization_name",
        first["organization_name"] == "Company 1",
    )
    check(
        "skills -> required_skills",
        first["required_skills"]
        == ["Python", "Django", "PostgreSQL"],
    )
    check(
        "deadline -> application_deadline",
        first["application_deadline"] == "2026-12-02",
    )

    # Check 3: rate-limit retry with backoff (Section 2.8).
    with patch(f"{REQUEST_MODULE}.get") as mock_get, patch(
        f"{SLEEP_MODULE}.sleep"
    ) as mock_sleep:
        mock_get.side_effect = [
            FakeResponse(
                status_code=429, headers={"Retry-After": "7"}
            ),
            FakeResponse(
                status_code=200,
                payload={"jobs": [mock_listing(i) for i in range(1, 6)]},
            ),
        ]
        retried = adapter.fetch()
        sleep_for_retry_after = 7.0 in [
            call[0][0] for call in mock_sleep.call_args_list
        ]

    check(
        "429 retried once before succeeding",
        mock_get.call_count == 2 and len(retried) == 5,
    )
    check(
        "Retry-After header honored during backoff",
        sleep_for_retry_after,
    )

    # Retries exhausted -> error surfaces to the caller.
    flaky = APIAdapter(
        DataSource(
            name="Flaky Mock API",
            type=DataSource.Type.API,
            base_url="https://flaky-mock.example.com/jobs",
            config={"max_retries": 2},
        )
    )
    with patch(f"{REQUEST_MODULE}.get") as mock_get, patch(
        f"{SLEEP_MODULE}.sleep"
    ):
        mock_get.side_effect = [
            FakeResponse(status_code=503),
            FakeResponse(status_code=503),
            FakeResponse(status_code=503),
        ]
        raised = False
        try:
            flaky.fetch()
        except Exception:
            raised = True

    check(
        "persistent 5xx raises after retries exhausted",
        raised and mock_get.call_count == 3,
    )

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()