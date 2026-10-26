"""
Verification script for Task 5.2 — Per-source adapter interface.

Checks:
1. BaseAdapter is abstract and exposes:
   - fetch()  -> list[RawListing]
   - normalize(raw) -> dict
2. Concrete adapters (API, RSS, career-site) implement the interface.
3. A FakeAdapter (test-only) returns 2 hardcoded raw listings, and
   normalize() on each produces exactly the Task 1.5 internal schema
   fields (SCHEMA_FIELDS).
4. The adapter registry maps every DataSource.Type to its adapter.
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.data_sources.models import DataSource
from apps.data_sources.tests import FakeAdapter
from apps.data_sources.adapters import (
    APIAdapter,
    BaseAdapter,
    CareerSiteAdapter,
    RSSAdapter,
    SCHEMA_FIELDS,
    get_adapter,
)


def run_checks():
    print("=" * 60)
    print("TASK 5.2 VERIFICATION: Per-source adapter interface")
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

    # Check 1: BaseAdapter is abstract with the required contract.
    check(
        "BaseAdapter is an ABC",
        getattr(BaseAdapter, "__abstractmethods__", None) is not None,
    )
    check(
        "BaseAdapter declares fetch -> list[RawListing]",
        "fetch" in BaseAdapter.__abstractmethods__,
    )
    check(
        "BaseAdapter declares normalize -> dict",
        "normalize" in BaseAdapter.__abstractmethods__,
    )
    try:
        BaseAdapter()
        check("BaseAdapter cannot be instantiated", False)
    except TypeError:
        check("BaseAdapter cannot be instantiated", True)

    # Check 2: Concrete adapters implement the interface.
    for adapter_class, label in (
        (APIAdapter, "APIAdapter"),
        (RSSAdapter, "RSSAdapter"),
        (CareerSiteAdapter, "CareerSiteAdapter"),
    ):
        check(
            f"{label} subclasses BaseAdapter",
            issubclass(adapter_class, BaseAdapter),
        )
        check(
            f"{label} has no unimplemented abstract methods",
            adapter_class.__abstractmethods__ == set(),
        )

    # Check 3: FakeAdapter returns 2 hardcoded raw listings and
    # normalize() produces exactly the Task 1.5 schema.
    fake = FakeAdapter()
    listings = fake.fetch()
    check(
        "FakeAdapter.fetch() returns a list",
        isinstance(listings, list),
    )
    check(
        "FakeAdapter.fetch() returns 2 listings",
        len(listings) == 2,
    )
    for i, raw in enumerate(listings, start=1):
        normalized = fake.normalize(raw)
        check(
            f"normalize() listing {i} has all Task 1.5 fields "
            f"({len(normalized)}/{len(SCHEMA_FIELDS)})",
            set(normalized.keys()) == set(SCHEMA_FIELDS),
        )
    check(
        "normalize() fills pipeline defaults",
        fake.normalize(listings[0])["status"] == "draft"
        and fake.normalize(listings[0])["is_verified"] is False,
    )

    # Check 4: Registry maps every DataSource.Type.
    cleanup = []
    try:
        expectations = {
            DataSource.Type.API: APIAdapter,
            DataSource.Type.RSS: RSSAdapter,
            DataSource.Type.CAREER_SITE: CareerSiteAdapter,
        }
        for source_type, adapter_class in expectations.items():
            source = DataSource.objects.create(
                name=f"Verify {source_type}",
                type=source_type,
                base_url=f"https://example.com/{source_type}",
            )
            cleanup.append(source.id)
            adapter = get_adapter(source)
            check(
                f"get_adapter('{source_type}') -> {adapter_class.__name__}",
                isinstance(adapter, adapter_class),
            )
    finally:
        DataSource.objects.filter(id__in=cleanup).delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()