from django.test import TestCase, TransactionTestCase, override_settings
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from unittest.mock import patch

import requests

from rest_framework.test import APIClient
from rest_framework import status as drf_status

from apps.common.models import TimeStampedModel
from apps.internships.models import (
    Internship,
    InternshipDuplicateFlag,
    Skill,
)
from apps.internships.tasks import validate_listing_urls_task
from apps.accounts.models import User
from .models import DataSource
from .adapters import (
    APIAdapter,
    BaseAdapter,
    CareerSiteAdapter,
    RSSAdapter,
    SCHEMA_FIELDS,
    get_adapter,
    normalize_raw_to_schema,
)
from .services.dedupe import (
    DEDUPE_FUZZY_THRESHOLD,
    find_exact_duplicate,
    find_near_duplicate,
    store_listing,
)
from .services.normalization import (
    FUZZY_MATCH_THRESHOLD,
    compute_content_hash,
    normalize_listing,
    strip_html,
)
from .services.urlcheck import (
    validate_listing_urls,
    validate_url,
)


def active_internship_queryset():
    """Mirror of the student-facing active search querysets."""
    now = timezone.now()
    return Internship.objects.filter(
        status=Internship.STATUS_ACTIVE,
        is_verified=True,
        needs_review=False,
    ).filter(
        Q(application_deadline__isnull=True)
        | Q(application_deadline__gt=now)
    )


class DataSourceModelTest(TestCase):
    """Test cases for DataSource model (Section 3.6 / Task 1.4)."""

    def test_create_data_source(self):
        """Test creating a data source with all fields."""
        ds = DataSource.objects.create(
            name="Remotive API",
            type=DataSource.Type.API,
            base_url="https://remotive.com/api/remote-jobs",
            config={"api_key": "secret", "rate_limit": 60},
            is_active=True,
            last_synced_at=timezone.now(),
        )
        self.assertEqual(ds.name, "Remotive API")
        self.assertEqual(ds.type, "api")
        self.assertEqual(ds.base_url, "https://remotive.com/api/remote-jobs")
        self.assertEqual(ds.config["api_key"], "secret")
        self.assertTrue(ds.is_active)
        self.assertIsNotNone(ds.last_synced_at)
        self.assertIsNotNone(ds.created_at)
        self.assertIsNotNone(ds.updated_at)
        self.assertTrue(issubclass(DataSource, TimeStampedModel))

    def test_data_source_str_representation(self):
        """Test string representation of DataSource."""
        ds = DataSource.objects.create(
            name="Feed RSS",
            type=DataSource.Type.RSS,
        )
        self.assertIn("Feed RSS", str(ds))
        self.assertIn("RSS Feed", str(ds))

    def test_data_source_name_unique(self):
        """Test that data source name must be unique."""
        DataSource.objects.create(name="Unique Source")
        with self.assertRaises(IntegrityError):
            DataSource.objects.create(name="Unique Source")


# ----------------------------------------------------------------------
# Task 5.2 — Per-source adapter interface
# ----------------------------------------------------------------------


class FakeAdapter(BaseAdapter):
    """
    Test-only adapter: returns 2 hardcoded raw listings so the
    per-source adapter contract (Section 2.5) can be verified without
    any external network or dependency.
    """

    RAW_LISTINGS = [
        {
            "external_id": "FAKE-001",
            "title": "Python Backend Intern",
            "organization_name": "Fake Technology",
            "description": "Backend development internship.",
            "category": "Software Engineering",
            "country": "Ethiopia",
            "city": "Addis Ababa",
            "location_text": "Addis Ababa",
            "internship_type": "remote",
            "work_type": "part_time",
            "compensation_type": "paid",
            "minimum_compensation": 300,
            "maximum_compensation": 600,
            "compensation_currency": "USD",
            "compensation_period": "monthly",
            "required_skills": ["Python", "Django", "PostgreSQL"],
            "preferred_skills": ["Docker", "REST API"],
            "duration_min_weeks": 8,
            "duration_max_weeks": 16,
            "application_url": "https://example.com/apply/FAKE-001",
            "source_url": "https://example.com/jobs/FAKE-001",
            "posted_at": "2026-08-01T10:00:00Z",
            "application_deadline": "2026-09-30T23:59:59Z",
        },
        {
            "external_id": "FAKE-002",
            "title": "Frontend React Intern",
            "organization_name": "Fake Digital",
            "description": "Frontend development internship.",
            "category": "Frontend Development",
            "country": "Ethiopia",
            "city": "Addis Ababa",
            "location_text": "Addis Ababa",
            "internship_type": "hybrid",
            "work_type": "part_time",
            "compensation_type": "unpaid",
            "required_skills": ["React", "TypeScript", "JavaScript"],
            "preferred_skills": ["Tailwind CSS"],
            "duration_min_weeks": 10,
            "duration_max_weeks": 20,
            "application_url": "https://example.com/apply/react",
            "source_url": "https://example.com/jobs/FAKE-002",
            "posted_at": "2026-08-05T10:00:00Z",
            "application_deadline": "2026-10-15T23:59:59Z",
        },
    ]

    def __init__(self, source=None):
        self.source = source

    def fetch(self):
        return list(self.RAW_LISTINGS)

    def normalize(self, raw):
        return normalize_raw_to_schema(raw)


class AdapterInterfaceTest(TestCase):
    """Task 5.2 — FakeAdapter + per-source adapter contract."""

    def setUp(self):
        self.adapter = FakeAdapter()

    def test_base_adapter_is_abstract(self):
        """BaseAdapter is abstract and not directly instantiable."""
        with self.assertRaises(TypeError):
            BaseAdapter()

    def test_fake_adapter_returns_two_hardcoded_raw_listings(self):
        """FakeAdapter.fetch() returns exactly 2 hardcoded listings."""
        listings = self.adapter.fetch()
        self.assertEqual(len(listings), 2)
        self.assertIsInstance(listings, list)
        self.assertIsInstance(listings[0], dict)
        self.assertIsInstance(listings[1], dict)

    def test_fake_adapter_normalize_produces_task15_schema(self):
        """normalize() yields exactly the Task 1.5 schema fields."""
        for raw in self.adapter.fetch():
            normalized = self.adapter.normalize(raw)
            self.assertEqual(
                set(normalized), set(SCHEMA_FIELDS)
            )
            self.assertEqual(
                set(normalized.keys()), set(SCHEMA_FIELDS)
            )
            self.assertEqual(len(normalized), len(SCHEMA_FIELDS))

    def test_fake_adapter_normalize_preserves_values(self):
        """normalize() keeps the source values intact."""
        raw = self.adapter.fetch()[0]
        normalized = self.adapter.normalize(raw)
        self.assertEqual(normalized["external_id"], "FAKE-001")
        self.assertEqual(normalized["title"], "Python Backend Intern")
        self.assertEqual(
            normalized["organization_name"], "Fake Technology"
        )
        self.assertEqual(normalized["country"], "Ethiopia")
        self.assertEqual(normalized["city"], "Addis Ababa")
        self.assertEqual(normalized["minimum_compensation"], 300)
        self.assertEqual(normalized["maximum_compensation"], 600)
        self.assertEqual(
            normalized["required_skills"],
            ["Python", "Django", "PostgreSQL"],
        )

    def test_normalize_sets_pipeline_defaults(self):
        """New listings normalize as unverified drafts."""
        normalized = self.adapter.normalize(
            self.adapter.fetch()[0]
        )
        self.assertFalse(normalized["is_verified"])
        self.assertEqual(normalized["status"], "draft")

    def test_normalize_trims_and_defaults_partial_raw(self):
        """normalize() fills missing fields with safe defaults."""
        normalized = normalize_raw_to_schema(
            {
                "external_id": 42,
                "title": "  Data Intern  ",
                "application_url": "https://example.com/apply",
            }
        )
        self.assertEqual(normalized["title"], "Data Intern")
        self.assertEqual(normalized["external_id"], "42")
        self.assertEqual(normalized["description"], "")
        self.assertEqual(normalized["required_skills"], [])
        self.assertEqual(normalized["compensation_type"], "unknown")
        self.assertEqual(normalized["status"], "draft")

    def test_concrete_adapters_implement_base_interface(self):
        """API/RSS/career-site adapters implement the full contract."""
        for adapter_class in (
            APIAdapter,
            RSSAdapter,
            CareerSiteAdapter,
        ):
            self.assertTrue(issubclass(adapter_class, BaseAdapter))
            self.assertEqual(adapter_class.__abstractmethods__, set())
            self.assertTrue(callable(getattr(adapter_class, "fetch")))
            self.assertTrue(callable(getattr(adapter_class, "normalize")))

    def test_adapter_registry_maps_all_source_types(self):
        """Each DataSource.Type resolves to the correct adapter."""
        expectations = {
            DataSource.Type.API: APIAdapter,
            DataSource.Type.RSS: RSSAdapter,
            DataSource.Type.CAREER_SITE: CareerSiteAdapter,
        }

        for source_type, adapter_class in expectations.items():
            with self.subTest(source_type=source_type):
                source = DataSource.objects.create(
                    name=f"Source {source_type}",
                    type=source_type,
                    base_url=f"https://example.com/{source_type}",
                )
                adapter = get_adapter(source)
                self.assertIsInstance(adapter, adapter_class)
                self.assertEqual(adapter.source, source)

    def test_get_adapter_unknown_type_raises(self):
        """An unregistered source type raises ValueError."""
        source = DataSource(
            name="Unknown Source",
            type="carrier_pigeon",
        )
        with self.assertRaises(ValueError):
            get_adapter(source)


# ----------------------------------------------------------------------
# Task 5.3 — API collector (Section 3.10.2, Figure 3.9)
# ----------------------------------------------------------------------

REQUIRED_INTERNAL_FIELDS = [
    "external_id",
    "title",
    "organization_name",
    "description",
    "required_skills",
    "application_url",
    "application_deadline",
]


class FakeResponse:
    """Minimal stand-in for a ``requests.Response``."""

    def __init__(
        self,
        status_code=200,
        payload=None,
        headers=None,
        content=None,
        encoding="utf-8",
    ):
        self.status_code = status_code
        self.payload = payload
        self.headers = headers or {}
        self.content = content
        self.encoding = encoding

    @property
    def text(self):
        if self.content is not None:
            return self.content.decode(self.encoding or "utf-8")
        if isinstance(self.payload, str):
            return self.payload
        return ""

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(
                f"{self.status_code} Client/Server Error"
            )


def mock_listing(i):
    """Build one external API listing (task field names)."""
    return {
        "external_id": f"REMOTE-{i:03d}",
        "title": f"Python Backend Intern {i}",
        "company_name": f"Company {i}",
        "description": f"Backend internship number {i}.",
        "skills": ["Python", "Django", "PostgreSQL"],
        "application_url": f"https://jobs.example.com/apply/{i}",
        "deadline": f"2026-12-{i % 28 + 1:02d}",
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
        "posted_at": "2026-08-01T00:00:00Z",
        "duration_min_weeks": 8,
        "duration_max_weeks": 16,
    }


class APIAdapterTest(TestCase):
    """Task 5.3 — API collector against a mock endpoint."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="Mock Internship API",
            type=DataSource.Type.API,
            base_url="https://mock-api.example.com/internships",
            config={"results_path": "jobs"},
        )
        self.adapter = APIAdapter(self.source)

    def _payload_of(self, count=5):
        return {"jobs": [mock_listing(i) for i in range(1, count + 1)]}

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    def test_mock_endpoint_produces_five_normalized_records(
        self, mock_sleep, mock_get
    ):
        """5 listings from the mock endpoint -> 5 normalized records."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            payload=self._payload_of(5),
        )

        raw_listings = self.adapter.fetch()
        self.assertEqual(len(raw_listings), 5)

        normalized_records = [
            self.adapter.normalize(raw) for raw in raw_listings
        ]
        self.assertEqual(len(normalized_records), 5)

        for record in normalized_records:
            self.assertEqual(
                set(record.keys()), set(SCHEMA_FIELDS)
            )
            for field in REQUIRED_INTERNAL_FIELDS:
                self.assertTrue(
                    record[field],
                    f"Required field '{field}' is missing/empty: "
                    f"{record}",
                )

    @patch("apps.data_sources.adapters.http.requests.get")
    def test_external_fields_map_to_internal_schema(
        self, mock_get
    ):
        """company_name/skills/deadline map onto the internal schema."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            payload=self._payload_of(5),
        )

        raw = self.adapter.fetch()[0]
        normalized = self.adapter.normalize(raw)

        self.assertEqual(
            normalized["organization_name"], "Company 1"
        )
        self.assertEqual(
            normalized["required_skills"],
            ["Python", "Django", "PostgreSQL"],
        )
        self.assertEqual(
            normalized["application_deadline"], "2026-12-02"
        )
        self.assertEqual(
            normalized["application_url"],
            "https://jobs.example.com/apply/1",
        )
        self.assertEqual(normalized["title"], "Python Backend Intern 1")

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    def test_rate_limit_retries_then_succeeds(
        self, mock_sleep, mock_get
    ):
        """429 is retried with backoff, then the request succeeds."""
        mock_get.side_effect = [
            FakeResponse(status_code=429, headers={"Retry-After": "7"}),
            FakeResponse(status_code=200, payload=self._payload_of(5)),
        ]

        raw_listings = self.adapter.fetch()

        self.assertEqual(len(raw_listings), 5)
        self.assertEqual(mock_get.call_count, 2)
        mock_sleep.assert_any_call(7.0)

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    def test_rate_limit_honors_retry_after(self, mock_sleep, mock_get):
        """Retry-After header drives the backoff delay."""
        mock_get.return_value = FakeResponse(
            status_code=429,
            headers={"Retry-After": "7"},
            payload=self._payload_of(5),
        )

        with self.assertRaises(requests.HTTPError):
            self.adapter.fetch()

        self.assertEqual(mock_sleep.call_args_list[0], ((7.0,), {}))

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    def test_retries_exhausted_after_max_attempts(
        self, mock_sleep, mock_get
    ):
        """Persistent 5xx raises after the configured attempts."""
        source = DataSource(
            name="Flaky API",
            type=DataSource.Type.API,
            base_url="https://flaky.example.com/jobs",
            config={"max_retries": 2},
        )
        adapter = APIAdapter(source)

        mock_get.side_effect = [
            FakeResponse(status_code=503),
            FakeResponse(status_code=500),
            FakeResponse(status_code=502),
        ]

        with self.assertRaises(requests.HTTPError):
            adapter.fetch()

        # Initial request + 2 retries.
        self.assertEqual(mock_get.call_count, 3)
        # Exponential backoff: 1.0, 2.0.
        self.assertEqual(
            [call[0][0] for call in mock_sleep.call_args_list],
            [1.0, 2.0],
        )

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    @patch(
        "apps.data_sources.adapters.http.time.monotonic",
        side_effect=[100.0, 100.5, 102.5],
    )
    def test_min_request_interval_paces_calls(
        self, mock_monotonic, mock_sleep, mock_get
    ):
        """Requests respect a minimum interval between calls."""
        source = DataSource(
            name="Throttled API",
            type=DataSource.Type.API,
            base_url="https://throttled.example.com/jobs",
            config={"min_request_interval": 2.0},
        )
        adapter = APIAdapter(source)

        mock_get.return_value = FakeResponse(
            status_code=200,
            payload=self._payload_of(5),
        )

        adapter.fetch()
        adapter.fetch()

        # Second fetch waits the remaining pacing interval (2.0 - 0.5).
        self.assertEqual(
            mock_sleep.call_args_list, [((1.5,), {})]
        )


# ----------------------------------------------------------------------
# Task 5.4 — RSS collector (Section 3.10.3, Figure 3.10)
# ----------------------------------------------------------------------

RSS_FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Internships</title>
    <link>https://feeds.example.com/internships</link>
    <description>Sample internship feed</description>
    <item>
      <guid>https://feeds.example.com/jobs/1</guid>
      <title>Software Engineering Intern</title>
      <link>https://careers.example.com/jobs/1</link>
      <description>Build backend services with Django.</description>
      <pubDate>Mon, 03 Aug 2026 09:00:00 GMT</pubDate>
      <category>Engineering</category>
    </item>
    <item>
      <guid>https://feeds.example.com/jobs/2</guid>
      <title>Acme Corp - Data Science Intern</title>
      <link>https://careers.example.com/jobs/2</link>
      <description>Analyze user behaviour data.</description>
      <pubDate>Tue, 04 Aug 2026 09:00:00 GMT</pubDate>
      <category>Data</category>
    </item>
    <item>
      <guid>https://feeds.example.com/jobs/3</guid>
      <title>Design Intern</title>
      <link>https://careers.example.com/jobs/3</link>
      <description>Create user interfaces.</description>
    </item>
  </channel>
</rss>
"""


class RSSAdapterTest(TestCase):
    """Task 5.4 — feedparser-based RSS collector on a sample fixture."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="Sample Internship Feed",
            type=DataSource.Type.RSS,
            base_url="https://feeds.example.com/internships",
        )
        self.adapter = RSSAdapter(self.source)

    @patch("apps.data_sources.adapters.http.requests.get")
    @patch("apps.data_sources.adapters.http.time.sleep")
    def test_fixture_extracts_title_link_description(
        self, mock_sleep, mock_get
    ):
        """Each fixture item yields its title/link/description."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=RSS_FIXTURE.encode("utf-8"),
        )

        raw_listings = self.adapter.fetch()

        self.assertEqual(len(raw_listings), 3)

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

        for raw, want in zip(raw_listings, expected):
            with self.subTest(title=raw["title"]):
                self.assertEqual(raw["title"], want["title"])
                self.assertEqual(raw["application_url"], want["link"])
                self.assertEqual(raw["source_url"], want["link"])
                self.assertEqual(raw["description"], want["description"])

    @patch("apps.data_sources.adapters.http.requests.get")
    def test_fixture_maps_external_ids_and_dates(self, mock_get):
        """guid -> external_id, pubDate -> posted_at."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=RSS_FIXTURE.encode("utf-8"),
        )

        raw_listings = self.adapter.fetch()

        self.assertEqual(
            raw_listings[0]["external_id"],
            "https://feeds.example.com/jobs/1",
        )
        self.assertEqual(
            raw_listings[0]["posted_at"],
            "Mon, 03 Aug 2026 09:00:00 GMT",
        )
        # Item without pubDate still normalizes safely.
        self.assertIsNone(raw_listings[2]["posted_at"])

    @patch("apps.data_sources.adapters.http.requests.get")
    def test_normalize_produces_task15_schema(self, mock_get):
        """Normalized feed items carry the full Task 1.5 schema."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=RSS_FIXTURE.encode("utf-8"),
        )

        for raw in self.adapter.fetch():
            normalized = self.adapter.normalize(raw)
            self.assertEqual(
                set(normalized.keys()), set(SCHEMA_FIELDS)
            )
            self.assertEqual(normalized["status"], "draft")
            self.assertFalse(normalized["is_verified"])

    @patch("apps.data_sources.adapters.http.requests.get")
    def test_company_extracted_for_prefixed_titles(self, mock_get):
        """'Acme Corp - ...' title maps company onto organization_name."""
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=RSS_FIXTURE.encode("utf-8"),
        )

        raw = self.adapter.fetch()[1]

        self.assertEqual(raw["organization_name"], "Acme Corp")


# ----------------------------------------------------------------------
# Task 5.5 — Company career-site collector (Section 3.10.4)
# ----------------------------------------------------------------------

CAREER_SITE_FIXTURE = """<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Careers at Example Corp</h1>
  <ul class="job-list">
    <li class="job">
      <h2 class="job-title">Software Engineering Intern</h2>
      <a href="/jobs/software-engineering-intern">Apply</a>
      <p class="description">Build backend services with Django.</p>
      <span class="deadline">2026-12-31</span>
      <span class="location">Addis Ababa</span>
    </li>
    <li class="job">
      <h2 class="job-title">Data Science Intern</h2>
      <a href="/jobs/data-science-intern">Apply</a>
      <p class="description">Analyze user behaviour data.</p>
      <span class="deadline">2026-11-15</span>
      <span class="location">Remote</span>
    </li>
  </ul>
</body>
</html>
"""

ALLOWED_CAREER_SITES = {
    "careers.example.com": {
        "container_selector": "li.job",
        "field_selectors": {
            "title": ".job-title",
            "link": "a",
            "description": ".description",
            "deadline": ".deadline",
            "location": ".location",
        },
    },
}


class CareerSiteAdapterTest(TestCase):
    """Task 5.5 — career-site collector on a saved HTML fixture."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="Example Corp Careers",
            type=DataSource.Type.CAREER_SITE,
            base_url="https://careers.example.com/jobs",
            config={},
        )
        self.adapter = CareerSiteAdapter(self.source)

    def _fixture_response(self):
        return FakeResponse(
            status_code=200,
            content=CAREER_SITE_FIXTURE.encode("utf-8"),
        )

    @override_settings(ALLOWED_CAREER_SITES=ALLOWED_CAREER_SITES)
    @patch("apps.data_sources.adapters.http.requests.get")
    def test_fixture_extracts_title_description_deadline(
        self, mock_get
    ):
        """Each HTML job block yields title/description/deadline."""
        mock_get.return_value = self._fixture_response()

        raw_listings = self.adapter.fetch()

        self.assertEqual(len(raw_listings), 2)

        first, second = raw_listings

        self.assertEqual(first["title"], "Software Engineering Intern")
        self.assertEqual(
            first["description"], "Build backend services with Django."
        )
        self.assertEqual(first["application_deadline"], "2026-12-31")
        self.assertEqual(first["organization_name"], "Example Corp Careers")
        self.assertEqual(
            first["application_url"],
            "https://careers.example.com/jobs/software-engineering-intern",
        )

        self.assertEqual(second["title"], "Data Science Intern")
        self.assertEqual(
            second["description"], "Analyze user behaviour data."
        )
        self.assertEqual(second["application_deadline"], "2026-11-15")

    @override_settings(ALLOWED_CAREER_SITES=ALLOWED_CAREER_SITES)
    @patch("apps.data_sources.adapters.http.requests.get")
    def test_fixture_normalizes_to_task15_schema(self, mock_get):
        """Career-site listings normalize onto the full schema."""
        mock_get.return_value = self._fixture_response()

        for raw in self.adapter.fetch():
            normalized = self.adapter.normalize(raw)
            self.assertEqual(
                set(normalized.keys()), set(SCHEMA_FIELDS)
            )
            self.assertEqual(normalized["status"], "draft")
            self.assertFalse(normalized["is_verified"])

    @override_settings(ALLOWED_CAREER_SITES=ALLOWED_CAREER_SITES)
    @patch("apps.data_sources.adapters.http.requests.get")
    def test_per_source_config_overrides_company_selectors(
        self, mock_get
    ):
        """DataSource config overrides the allow-listed selectors."""
        source = DataSource.objects.create(
            name="Example Corp TA Team",
            type=DataSource.Type.CAREER_SITE,
            base_url="https://careers.example.com/jobs",
            config={
                "container_selector": "article.role",
                "field_selectors": {
                    "title": "h3",
                    "link": "a",
                    "description": ".summary",
                    "deadline": ".closing",
                },
            },
        )
        adapter = CareerSiteAdapter(source)

        html_doc = """<html><body>
          <article class="role">
            <h3>Product Intern</h3>
            <a href="/jobs/product-intern">Apply</a>
            <p class="summary">Shape our product roadmap.</p>
            <span class="closing">2026-10-01</span>
          </article>
        </body></html>"""

        mock_get.return_value = FakeResponse(
            status_code=200,
            content=html_doc.encode("utf-8"),
        )

        raw_listings = adapter.fetch()

        self.assertEqual(len(raw_listings), 1)
        self.assertEqual(raw_listings[0]["title"], "Product Intern")
        self.assertEqual(
            raw_listings[0]["description"], "Shape our product roadmap."
        )
        self.assertEqual(
            raw_listings[0]["application_deadline"], "2026-10-01"
        )

    @override_settings(ALLOWED_CAREER_SITES={})
    @patch("apps.data_sources.adapters.http.requests.get")
    def test_non_allowlisted_host_is_refused(self, mock_get):
        """Hosts outside the trusted allow-list are not scraped."""
        source = DataSource.objects.create(
            name="Rogue Scraper",
            type=DataSource.Type.CAREER_SITE,
            base_url="https://evil.example.net/jobs",
            config={},
        )
        adapter = CareerSiteAdapter(source)

        with self.assertRaises(PermissionError):
            adapter.fetch()

        mock_get.assert_not_called()


# ----------------------------------------------------------------------
# Task 5.6 — Shared listing normalisation (Section 3.10.5)
# ----------------------------------------------------------------------


class NormalizeListingTest(TestCase):
    """Task 5.6 — ``normalize_listing`` shared normalisation util."""

    def setUp(self):
        self.skills = {
            "python": Skill.objects.create(
                name="Python",
                category="Programming Languages",
            ),
            "javascript": Skill.objects.create(
                name="JavaScript",
                category="Programming Languages",
            ),
            "django": Skill.objects.create(
                name="Django",
                category="Frameworks",
            ),
            "react": Skill.objects.create(
                name="React",
                category="Frameworks",
            ),
        }

    def _raw(self, **overrides):
        raw = {
            "external_id": "NORM-001",
            "title": "  Backend  Data  Intern  ",
            "organization_name": "Example Corp",
            "description": (
                "<p><strong>Backend</strong> internship with "
                "<a href='https://example.com'>Example Corp</a>.</p>"
            ),
            "category": "Software Engineering",
            "country": "",
            "city": "",
            "location_text": "  Addis Ababa, ethiopia  ",
            "internship_type": "remote",
            "work_type": "full_time",
            "compensation_type": "paid",
            "minimum_compensation": 500,
            "maximum_compensation": 1000,
            "compensation_currency": "USD",
            "compensation_period": "monthly",
            "required_skills": ["Python", "Django"],
            "preferred_skills": [" React ", "Tailwind CSS"],
            "duration_min_weeks": 8,
            "duration_max_weeks": 16,
            "application_url": "https://example.com/apply",
            "source_url": "https://example.com/jobs/1",
            "posted_at": "2026-08-01T10:00:00Z",
            "application_deadline": "2026-09-30T23:59:59Z",
        }
        raw.update(overrides)
        return raw

    def test_whitespace_and_html_are_cleaned(self):
        """Whitespace collapses and HTML tags are stripped."""
        normalized = normalize_listing(self._raw())

        self.assertEqual(normalized["title"], "Backend Data Intern")
        self.assertEqual(
            normalized["description"],
            "Backend internship with Example Corp.",
        )

    def test_location_is_standardized_from_combined_string(self):
        """'  Addis Ababa, ethiopia  ' -> Ethiopia / Addis Ababa."""
        normalized = normalize_listing(self._raw())

        self.assertEqual(normalized["country"], "Ethiopia")
        self.assertEqual(normalized["city"], "Addis Ababa")
        self.assertEqual(
            normalized["location_text"], "Addis Ababa, Ethiopia"
        )

    def test_location_field_lookup_handles_unknowns(self):
        """Unknown locations keep their cleaned text, no crash."""
        normalized = normalize_listing(
            self._raw(location_text="  Somewhere, Elsewhere  ")
        )

        self.assertEqual(normalized["country"], "Elsewhere")
        self.assertEqual(normalized["city"], "Somewhere")
        self.assertEqual(
            normalized["location_text"], "Somewhere, Elsewhere"
        )

    def test_exact_skill_matches_link_to_catalogue(self):
        """Exact skill names map to Skill rows without flagging."""
        normalized = normalize_listing(
            self._raw(required_skills=["Python", "Django"])
        )

        expected_ids = [
            self.skills["python"].id,
            self.skills["django"].id,
        ]
        self.assertEqual(
            normalized["required_skills"], ["Python", "Django"]
        )
        self.assertEqual(
            sorted(normalized["required_skill_ids"]),
            sorted(expected_ids),
        )
        self.assertEqual(normalized["skills_review"], [])

    def test_fuzzy_skill_match_is_accepted_and_flagged(self):
        """'Java Script' fuzzy-matches JavaScript, flagged for review."""
        normalized = normalize_listing(
            self._raw(required_skills=["Java Script"])
        )

        self.assertEqual(normalized["required_skills"], ["JavaScript"])
        self.assertEqual(
            normalized["required_skill_ids"],
            [self.skills["javascript"].id],
        )

        review = normalized["skills_review"]
        self.assertEqual(len(review), 1)
        entry = review[0]
        self.assertEqual(entry["text"], "Java Script")
        self.assertEqual(entry["matched_skill"], "JavaScript")
        self.assertEqual(
            entry["matched_skill_id"], self.skills["javascript"].id
        )
        self.assertEqual(entry["method"], "fuzzy")
        self.assertGreaterEqual(entry["score"], FUZZY_MATCH_THRESHOLD)
        self.assertTrue(entry["low_confidence"])

    def test_unmatched_skill_is_flagged_for_review(self):
        """Unmatched skill text is kept for the Task 5.9 admin review."""
        normalized = normalize_listing(
            self._raw(required_skills=["Quantum Computing"])
        )

        self.assertEqual(normalized["required_skills"], [])
        self.assertEqual(normalized["required_skill_ids"], [])

        review = normalized["skills_review"]
        self.assertEqual(len(review), 1)
        entry = review[0]
        self.assertEqual(entry["text"], "Quantum Computing")
        self.assertIsNone(entry["matched_skill"])
        self.assertIsNone(entry["matched_skill_id"])
        self.assertIsNone(entry["method"])
        self.assertTrue(entry["low_confidence"])

    def test_preferred_skills_are_cleaned_not_looked_up(self):
        """Preferred skills are whitespace-cleaned text only."""
        normalized = normalize_listing(self._raw())

        self.assertEqual(
            normalized["preferred_skills"], ["React", "Tailwind CSS"]
        )
        self.assertNotIn("preferred_skill_ids", normalized)

    def test_output_covers_task15_schema_and_pipeline_metadata(self):
        """Output is a superset of SCHEMA_FIELDS with source/pipeline info."""
        normalized = normalize_listing(self._raw(), source_type="api")

        for field in SCHEMA_FIELDS:
            self.assertIn(field, normalized)
        self.assertEqual(normalized["status"], "draft")
        self.assertFalse(normalized["is_verified"])
        self.assertEqual(normalized["source_type"], "api")
        self.assertIn("required_skill_ids", normalized)
        self.assertIn("skills_review", normalized)
        self.assertIn("description", normalized)

    def test_messy_multi_field_input_gives_consistent_output(self):
        """Everything from the task description, verified in one pass."""
        normalized = normalize_listing(
            self._raw(
                description=(
                    "<div>  <h2>Data  Intern</h2>  <p>Work  with "
                    "<b>pandas</b> &amp; SQL.  </p>  </div>"
                ),
                required_skills=["  Python ", "Django", "Java Script"],
            )
        )

        self.assertEqual(
            normalized["description"],
            "Data Intern Work with pandas & SQL.",
        )
        self.assertEqual(normalized["country"], "Ethiopia")
        self.assertEqual(normalized["city"], "Addis Ababa")
        self.assertEqual(
            normalized["location_text"], "Addis Ababa, Ethiopia"
        )
        # Python + Django exact, Java Script fuzzy-matched.
        self.assertEqual(
            set(normalized["required_skill_ids"]),
            {
                self.skills["python"].id,
                self.skills["django"].id,
                self.skills["javascript"].id,
            },
        )
        fuzzy_entries = [
            entry
            for entry in normalized["skills_review"]
            if entry["method"] == "fuzzy"
        ]
        self.assertEqual(len(fuzzy_entries), 1)
        self.assertEqual(fuzzy_entries[0]["text"], "Java Script")


class StripHtmlTest(TestCase):
    """Task 5.6 — HTML stripping helper edge cases."""

    def test_plain_text_passes_through(self):
        self.assertEqual(strip_html("Plain  text  here."), "Plain text here.")

    def test_nested_markup_is_flattened(self):
        self.assertEqual(
            strip_html("<p>Hello <b>world</b>!</p>"),
            "Hello world!",
        )

    def test_entities_are_resolved(self):
        self.assertEqual(
            strip_html("<p>R&amp;D and &lt;tags&gt;</p>"),
            "R&D and <tags>",
        )

    def test_empty_input_returns_empty(self):
        self.assertEqual(strip_html(""), "")
        self.assertEqual(strip_html(None), "")


# ----------------------------------------------------------------------
# Task 5.7 — Duplicate detection (Section 3.10.6)
# ----------------------------------------------------------------------


class DuplicateDetectionTest(TestCase):
    """Task 5.7 — exact-hash + fuzzy near-duplicate detection."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="Dedupe Test API",
            type=DataSource.Type.API,
            base_url="https://dedupe.example.com/jobs",
        )

    def _listing(self, title="Python Backend Intern", company="Example Corp",
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

    def test_normalized_listing_carries_deterministic_content_hash(self):
        """content_hash = sha256 of title+company+application_url."""
        listing = self._listing()
        listing2 = self._listing()

        self.assertEqual(
            listing["content_hash"], listing2["content_hash"]
        )
        self.assertEqual(
            listing["content_hash"],
            compute_content_hash(
                "Python Backend Intern",
                "Example Corp",
                "https://example.com/apply/backend",
            ),
        )
        self.assertEqual(len(listing["content_hash"]), 64)

    def test_content_hash_ignores_case_and_whitespace(self):
        """Hash input is normalized before hashing."""
        self.assertEqual(
            compute_content_hash(
                "  Python Backend Intern ",
                "example CORP",
                "https://example.com/APPLY/backend",
            ),
            compute_content_hash(
                "python backend intern",
                "Example Corp",
                "https://example.com/apply/backend",
            ),
        )

    def test_same_listing_twice_produces_single_db_row(self):
        """Exact hash match -> skip insert, bump last_seen_at."""
        from django.utils import timezone

        listing = self._listing()

        first = store_listing(listing, data_source=self.source)
        self.assertEqual(Internship.objects.count(), 1)
        self.assertEqual(first.action, "created")

        now = timezone.now()
        second = store_listing(listing, data_source=self.source, now=now)

        self.assertEqual(second.action, "duplicate")
        self.assertEqual(Internship.objects.count(), 1)
        self.assertEqual(
            second.internship.pk, first.internship.pk
        )
        self.assertEqual(second.internship.last_seen_at, now)

    def test_exact_duplicate_updates_last_seen_at_on_existing_row(self):
        """last_seen_at reflects the latest collection, not the insert."""
        from django.utils import timezone
        from datetime import datetime

        listing = self._listing()
        first_now = datetime(2026, 8, 1, tzinfo=timezone.now().tzinfo)
        second_now = datetime(2026, 8, 15, tzinfo=timezone.now().tzinfo)

        store_listing(listing, data_source=self.source, now=first_now)
        row = Internship.objects.get(content_hash=listing["content_hash"])
        self.assertEqual(row.last_seen_at, first_now)

        store_listing(listing, data_source=self.source, now=second_now)
        row.refresh_from_db()
        self.assertEqual(row.last_seen_at, second_now)

    def test_near_duplicate_is_flagged_not_merged_not_duplicated(self):
        """Reworded title + same company -> admin review flag only."""
        listing = self._listing()
        store_listing(listing, data_source=self.source)
        self.assertEqual(Internship.objects.count(), 1)

        near = self._listing(
            title="Python Backend Internship",
            app_url="https://example.com/apply/backend-2",
        )

        result = store_listing(near, data_source=self.source)

        # Not silently merged, not silently duplicated.
        self.assertEqual(result.action, "near_duplicate")
        self.assertEqual(Internship.objects.count(), 1)

        # Flagged for admin review against the stored row.
        stored = Internship.objects.get()
        flag = InternshipDuplicateFlag.objects.get()
        self.assertEqual(flag.review_status, "pending")
        self.assertEqual(flag.internship.pk, stored.pk)
        self.assertIsNotNone(flag.similarity_score)
        self.assertGreaterEqual(flag.similarity_score, DEDUPE_FUZZY_THRESHOLD)
        self.assertEqual(flag.title, "Python Backend Internship")

    def test_repeated_near_duplicate_does_not_stack_flags(self):
        """Same near-duplicate seen twice -> one pending flag, refreshed."""
        listing = self._listing()
        store_listing(listing, data_source=self.source)

        near = self._listing(
            title="Python Backend Internship",
            app_url="https://example.com/apply/backend-2",
        )

        store_listing(near, data_source=self.source)
        store_listing(near, data_source=self.source)

        self.assertEqual(Internship.objects.count(), 1)
        self.assertEqual(InternshipDuplicateFlag.objects.count(), 1)
        self.assertEqual(
            InternshipDuplicateFlag.objects.get().review_status, "pending"
        )

    def test_distinct_listing_is_created(self):
        """Different company/title -> new row, no flag."""
        listing = self._listing()
        store_listing(listing, data_source=self.source)

        other = self._listing(
            title="Data Science Intern",
            company="Another Org",
            app_url="https://other.example.com/apply/1",
        )

        result = store_listing(other, data_source=self.source)

        self.assertEqual(result.action, "created")
        self.assertEqual(Internship.objects.count(), 2)
        self.assertEqual(InternshipDuplicateFlag.objects.count(), 0)

    def test_store_records_data_source_pipeline_defaults(self):
        """Stored rows keep the data_source link + unverified draft state."""
        listing = self._listing()
        result = store_listing(listing, data_source=self.source)

        row = result.internship
        self.assertEqual(row.data_source_id, self.source.id)
        self.assertEqual(row.status, "draft")
        self.assertFalse(row.is_verified)
        self.assertEqual(
            row.content_hash, listing["content_hash"]
        )

    def test_finders_behave_for_exact_and_near_cases(self):
        """Standalone finders reflect exact vs. near-duplicate logic."""
        listing = self._listing()
        store_listing(listing, data_source=self.source)

        exact = find_exact_duplicate(listing["content_hash"])
        self.assertIsNotNone(exact)
        self.assertIsNone(
            find_exact_duplicate("0" * 64)
        )

        near = self._listing(
            title="Python Backend Internship",
            app_url="https://example.com/apply/backend-2",
        )
        matched, score = find_near_duplicate(near)
        self.assertEqual(matched.pk, Internship.objects.get().pk)
        self.assertGreaterEqual(score, DEDUPE_FUZZY_THRESHOLD)

        unrelated, score = find_near_duplicate(
            self._listing(title="UX Designer Intern", company="Design Co")
        )
        self.assertIsNone(unrelated)

# ----------------------------------------------------------------------
# Task 5.9 — URL validation (Section 3.10.8)
# ----------------------------------------------------------------------


class ValidateUrlTest(TestCase):
    """Task 5.9 — single-URL HEAD/GET validation."""

    def _requests(self, side_effect):
        return patch(
            "apps.data_sources.services.urlcheck.requests.request",
            side_effect=side_effect,
        )

    def test_valid_url_ok_via_head(self):
        with self._requests([FakeResponse(status_code=200)]):
            result = validate_url("https://jobs.example.com/1")
        self.assertTrue(result["valid"])
        self.assertEqual(result["method"], "HEAD")
        self.assertEqual(result["status_code"], 200)
        self.assertIsNone(result["error"])

    def test_404_url_is_invalid(self):
        with self._requests([FakeResponse(status_code=404)]):
            result = validate_url("https://jobs.example.com/missing")
        self.assertFalse(result["valid"])
        self.assertEqual(result["status_code"], 404)
        self.assertEqual(result["method"], "HEAD")

    def test_head_blocked_falls_back_to_get(self):
        with self._requests([FakeResponse(status_code=405),
                             FakeResponse(status_code=200)]):
            result = validate_url("https://jobs.example.com/1")
        self.assertTrue(result["valid"])
        self.assertEqual(result["method"], "GET")

    def test_head_network_error_falls_back_to_get(self):
        with self._requests([requests.ConnectionError("head refused"),
                             FakeResponse(status_code=200)]):
            result = validate_url("https://jobs.example.com/1")
        self.assertTrue(result["valid"])
        self.assertEqual(result["method"], "GET")

    def test_get_failure_is_invalid_with_error(self):
        with self._requests([requests.ConnectionError("refused"),
                             requests.Timeout("timed out")]):
            result = validate_url("https://jobs.example.com/1")
        self.assertFalse(result["valid"])
        self.assertEqual(result["error"], "timed out")

    def test_empty_url_is_invalid(self):
        result = validate_url("   ")
        self.assertFalse(result["valid"])
        self.assertEqual(result["error"], "empty_url")


class ValidateListingUrlsTest(TestCase):
    """Task 5.9 — aggregate URL check for one listing."""

    def test_all_links_valid(self):
        good = FakeResponse(status_code=200)
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[good, good]):
            result = validate_listing_urls(
                "https://jobs.example.com/apply",
                "https://jobs.example.com/posts/1",
            )
        self.assertTrue(result["valid"])
        self.assertEqual(result["invalid_urls"], [])
        self.assertTrue(result["checks"]["application_url"]["valid"])
        self.assertTrue(result["checks"]["source_url"]["valid"])

    def test_broken_source_link_is_flagged(self):
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[FakeResponse(status_code=200),
                                FakeResponse(status_code=404)]):
            result = validate_listing_urls(
                "https://jobs.example.com/apply",
                "https://jobs.example.com/posts/missing",
            )
        self.assertFalse(result["valid"])
        self.assertEqual(result["invalid_urls"], ["source_url"])
        self.assertEqual(
            result["checks"]["source_url"]["status_code"], 404
        )

    def test_blank_source_url_is_skipped_not_invalid(self):
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[FakeResponse(status_code=200)]):
            result = validate_listing_urls(
                "https://jobs.example.com/apply",
                "",
            )
        self.assertTrue(result["valid"])
        self.assertEqual(
            result["checks"]["source_url"]["method"], "skipped"
        )


class ValidateListingUrlsTaskTest(TestCase):
    """Task 5.9 — async task outcome per internship."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="URL Task API",
            type=DataSource.Type.API,
            base_url="https://url-task.example.com/jobs",
        )

    def _internship(self, **overrides):
        defaults = {
            "title": "URL Check Intern",
            "organization_name": "Example Corp",
            "description": "URL validation internship.",
            "application_url": "https://ok.example.com/apply",
            "source_url": "https://ok.example.com/posts/1",
        }
        defaults.update(overrides)
        return Internship.objects.create(**defaults)

    def test_valid_listing_is_auto_published(self):
        internship = self._internship()
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[FakeResponse(status_code=200),
                                FakeResponse(status_code=200)]):
            result = validate_listing_urls_task.run(internship.pk)

        internship.refresh_from_db()
        self.assertFalse(internship.needs_review)
        self.assertEqual(internship.status, Internship.STATUS_ACTIVE)
        self.assertTrue(internship.is_verified)
        self.assertIsNotNone(internship.validated_at)
        self.assertEqual(result["invalid_urls"], [])
        self.assertIn(internship, list(active_internship_queryset()))

    def test_broken_link_is_flagged_not_shown(self):
        internship = self._internship(
            source_url="https://ok.example.com/posts/missing"
        )
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[FakeResponse(status_code=200),
                                FakeResponse(status_code=404)]):
            result = validate_listing_urls_task.run(internship.pk)

        internship.refresh_from_db()
        self.assertTrue(internship.needs_review)
        self.assertEqual(internship.status, Internship.STATUS_DRAFT)
        self.assertFalse(internship.is_verified)
        self.assertEqual(result["invalid_urls"], ["source_url"])
        self.assertNotIn(internship, list(active_internship_queryset()))
        self.assertEqual(
            internship.url_validation["source_url"]["status_code"], 404
        )

    def test_low_confidence_skills_also_flag_for_review(self):
        internship = self._internship(
            skills_review=[
                {
                    "text": "Java Script",
                    "matched_skill": "JavaScript",
                    "low_confidence": True,
                }
            ]
        )
        with patch("apps.data_sources.services.urlcheck.requests.request",
                   side_effect=[FakeResponse(status_code=200),
                                FakeResponse(status_code=200)]):
            result = validate_listing_urls_task.run(internship.pk)

        internship.refresh_from_db()
        self.assertTrue(internship.needs_review)
        self.assertEqual(result["invalid_urls"], [])
        self.assertNotIn(internship, list(active_internship_queryset()))

    def test_needs_review_active_row_is_still_hidden_from_students(self):
        internship = self._internship(
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=True,
        )
        self.assertNotIn(internship, list(active_internship_queryset()))


class URLValidationPipelineTest(TransactionTestCase):
    """Task 5.9 DoD — valid URL auto-published, broken URL flagged."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="URL Pipeline API",
            type=DataSource.Type.API,
            base_url="https://url-pipeline.example.com/jobs",
        )

    def _listing(self, title, app_url, source_url=None, **overrides):
        raw = {
            "external_id": title.lower().replace(" ", "-"),
            "title": title,
            "organization_name": "Example Corp",
            "description": f"{title} description.",
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
            "source_url": source_url or app_url,
            "posted_at": "2026-08-01T10:00:00Z",
            "application_deadline": "2026-09-30T23:59:59Z",
        }
        raw.update(overrides)
        return normalize_listing(raw, source_type="api")

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_pipeline_autopublishes_valid_and_flags_broken(self, mock_request):
        good_url = "https://jobs.example.com/valid/1"
        bad_url = "https://jobs.example.com/missing/1"

        def on_request(method, url, *args, **kwargs):
            if url == good_url:
                return FakeResponse(status_code=200)
            return FakeResponse(status_code=404)

        mock_request.side_effect = on_request

        valid = self._listing(
            "Valid URL Intern",
            good_url,
            source_url=good_url,
        )
        broken = self._listing(
            "Broken URL Intern",
            bad_url,
            source_url=good_url,
        )

        # Eager mode (test settings): the on_commit task runs inline.
        store_listing(valid, data_source=self.source)
        store_listing(broken, data_source=self.source)

        valid_row = Internship.objects.get(content_hash=valid["content_hash"])
        broken_row = Internship.objects.get(
            content_hash=broken["content_hash"]
        )

        # Valid listing -> auto-published and visible to students.
        self.assertFalse(valid_row.needs_review)
        self.assertEqual(valid_row.status, Internship.STATUS_ACTIVE)
        self.assertTrue(valid_row.is_verified)
        self.assertIn(valid_row, list(active_internship_queryset()))

        # Broken listing -> needs_review, not published, hidden.
        self.assertTrue(broken_row.needs_review)
        self.assertEqual(broken_row.status, Internship.STATUS_DRAFT)
        self.assertFalse(broken_row.is_verified)
        self.assertNotIn(broken_row, list(active_internship_queryset()))
        self.assertEqual(
            broken_row.url_validation["application_url"]["status_code"],
            404,
        )


# ----------------------------------------------------------------------
# Task 5.10 — Scheduling (Celery Beat, Section 3.10.1 / Figure 3.8)
# ----------------------------------------------------------------------


def scheduling_raw_listing(i=1, **overrides):
    """A single raw listing shaped like Task 1.5 schema fields."""
    raw = {
        "external_id": f"SRC-{i:03d}",
        "title": f"Scheduling Intern {i}",
        "organization_name": "Scheduling Corp",
        "description": f"Collection pipeline internship {i}.",
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
        "application_url": f"https://jobs.example.com/apply/{i}",
        "source_url": f"https://jobs.example.com/posts/{i}",
        "posted_at": "2026-08-01T10:00:00Z",
        "application_deadline": "2026-09-30T23:59:59Z",
    }
    raw.update(overrides)
    return raw


class FakeSchedulingAdapter:
    """Minimal adapter bound to a DataSource for the scheduling tests."""

    def __init__(self, source):
        self.source = source

    def fetch(self):
        return [scheduling_raw_listing(1), scheduling_raw_listing(2)]


class CollectDataSourceTaskTest(TransactionTestCase):
    """Task 5.10 — ``collect_data_source`` collects and stores listings."""

    def setUp(self):
        self.source = DataSource.objects.create(
            name="Scheduling API",
            type=DataSource.Type.API,
            base_url="https://jobs.example.com/api",
        )

    @patch("apps.data_sources.services.urlcheck.requests.request")
    @patch("apps.data_sources.tasks.get_adapter")
    def test_collect_stores_listings_and_updates_last_synced(
        self, mock_get_adapter, mock_request
    ):
        mock_request.return_value = FakeResponse(status_code=200)
        mock_get_adapter.return_value = FakeSchedulingAdapter(self.source)

        from apps.data_sources.tasks import collect_data_source

        result = collect_data_source.run(self.source.pk)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["records_created"], 2)
        self.assertEqual(Internship.objects.count(), 2)

        self.source.refresh_from_db()
        self.assertIsNotNone(self.source.last_synced_at)

    @patch("apps.data_sources.tasks.get_adapter")
    def test_collect_skips_inactive_source(self, mock_get_adapter):
        from apps.data_sources.tasks import collect_data_source

        self.source.is_active = False
        self.source.save(update_fields=["is_active"])

        result = collect_data_source.run(self.source.pk)

        self.assertEqual(result["status"], "skipped")
        mock_get_adapter.assert_not_called()
        self.assertEqual(Internship.objects.count(), 0)

    @patch("apps.data_sources.tasks.get_adapter")
    def test_collect_missing_source_returns_not_found(self, mock_get_adapter):
        from apps.data_sources.tasks import collect_data_source

        result = collect_data_source.run(99999)

        self.assertEqual(result["status"], "not_found")
        mock_get_adapter.assert_not_called()


class ScheduleDataSourceCollectionsTest(TestCase):
    """Task 5.10 — fan-out schedules only active sources of the type."""

    def setUp(self):
        self.api_active = DataSource.objects.create(
            name="API Active",
            type=DataSource.Type.API,
            base_url="https://a.example.com",
        )
        self.api_inactive = DataSource.objects.create(
            name="API Inactive",
            type=DataSource.Type.API,
            base_url="https://b.example.com",
            is_active=False,
        )
        self.rss_active = DataSource.objects.create(
            name="RSS Active",
            type=DataSource.Type.RSS,
            base_url="https://c.example.com/feed.xml",
        )

    @patch("apps.data_sources.tasks.collect_data_source.delay")
    def test_schedules_only_active_sources_of_requested_type(
        self, mock_delay
    ):
        from apps.data_sources.tasks import schedule_data_source_collections

        result = schedule_data_source_collections.run(
            "api"
        )

        self.assertEqual(result["sources_queued"], 1)
        ids = [call.args[0] for call in mock_delay.call_args_list]
        self.assertEqual(ids, [self.api_active.pk])
        self.assertNotIn(self.api_inactive.pk, ids)
        self.assertNotIn(self.rss_active.pk, ids)

    @patch("apps.data_sources.tasks.collect_data_source.delay")
    def test_schedules_all_active_sources_when_no_type(self, mock_delay):
        from apps.data_sources.tasks import schedule_data_source_collections

        result = schedule_data_source_collections.run(None)

        # api_active + rss_active (inactive one excluded).
        self.assertEqual(result["sources_queued"], 2)
        ids = {call.args[0] for call in mock_delay.call_args_list}
        self.assertEqual(ids, {self.api_active.pk, self.rss_active.pk})


class DataSourceSyncNowViewTest(TestCase):
    """Task 5.10 — manual admin trigger fires the same collection task."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpass123",
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)

        self.student = User.objects.create_user(
            email="student@example.com",
            password="studentpass123",
            role="student",
        )
        self.student_client = APIClient()
        self.student_client.force_authenticate(user=self.student)

        self.source = DataSource.objects.create(
            name="Sync Now API",
            type=DataSource.Type.API,
            base_url="https://sync.example.com/api",
        )

    @patch("apps.data_sources.views.collect_data_source.delay")
    def test_admin_sync_now_queues_collection(self, mock_delay):
        response = self.admin_client.post(
            f"/api/admin/data-sources/{self.source.pk}/sync-now/",
            format="json",
        )

        self.assertEqual(response.status_code, drf_status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["status"], "queued")
        mock_delay.assert_called_once_with(self.source.pk)

    def test_student_cannot_sync_now(self):
        response = self.student_client.post(
            f"/api/admin/data-sources/{self.source.pk}/sync-now/",
            format="json",
        )
        self.assertEqual(response.status_code, drf_status.HTTP_403_FORBIDDEN)

    @patch("apps.data_sources.views.collect_data_source.delay")
    def test_inactive_source_sync_now_rejected(self, mock_delay):
        self.source.is_active = False
        self.source.save(update_fields=["is_active"])

        response = self.admin_client.post(
            f"/api/admin/data-sources/{self.source.pk}/sync-now/",
            format="json",
        )
        self.assertEqual(response.status_code, drf_status.HTTP_400_BAD_REQUEST)
        mock_delay.assert_not_called()

    @patch("apps.data_sources.views.collect_data_source.delay")
    def test_missing_source_sync_now_404(self, mock_delay):
        response = self.admin_client.post(
            "/api/admin/data-sources/99999/sync-now/",
            format="json",
        )
        self.assertEqual(response.status_code, drf_status.HTTP_404_NOT_FOUND)
        mock_delay.assert_not_called()


class BeatScheduleTest(TestCase):
    """Task 5.10 — CELERY_BEAT_SCHEDULE carries the periodic entries."""

    def setUp(self):
        from config.celery_schedule import CELERY_BEAT_SCHEDULE

        self.schedule = CELERY_BEAT_SCHEDULE

    def test_api_collection_entry_present(self):
        entry = self.schedule.get("collect-api-data-sources")
        self.assertIsNotNone(entry)
        self.assertEqual(
            entry["task"],
            "apps.data_sources.tasks.schedule_data_source_collections",
        )
        self.assertEqual(entry["args"], ("api",))

    def test_rss_collection_entry_present(self):
        entry = self.schedule.get("collect-rss-data-sources")
        self.assertIsNotNone(entry)
        self.assertEqual(
            entry["task"],
            "apps.data_sources.tasks.schedule_data_source_collections",
        )
        self.assertEqual(entry["args"], ("rss",))

    def test_expiry_check_entry_present_daily(self):
        entry = self.schedule.get("expire-internships-daily")
        self.assertIsNotNone(entry)
        self.assertEqual(
            entry["task"], "apps.internships.tasks.expire_internships"
        )

    def test_api_collection_runs_every_2_hours(self):
        entry = self.schedule["collect-api-data-sources"]
        crontab = entry["schedule"]
        self.assertEqual(
            crontab.hour, {0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22})
        self.assertEqual(crontab.minute, {0})

    def test_rss_collection_runs_every_6_hours(self):
        entry = self.schedule["collect-rss-data-sources"]
        crontab = entry["schedule"]
        self.assertEqual(crontab.hour, {0, 6, 12, 18})
        self.assertEqual(crontab.minute, {0})

    def test_expiry_runs_daily_at_midnight(self):
        entry = self.schedule["expire-internships-daily"]
        crontab = entry["schedule"]
        self.assertEqual(crontab.hour, {0})
        self.assertEqual(crontab.minute, {0})

    def test_career_site_collection_runs_daily(self):
        entry = self.schedule.get("collect-career-site-data-sources")
        self.assertIsNotNone(entry)
        self.assertEqual(
            entry["task"],
            "apps.data_sources.tasks.schedule_data_source_collections",
        )
        self.assertEqual(entry["args"], ("career_site",))
        crontab = entry["schedule"]
        self.assertEqual(crontab.hour, {4})
        self.assertEqual(crontab.minute, {0})

    @patch("apps.data_sources.tasks.collect_data_source.delay")
    def test_periodic_and_manual_trigger_fire_same_task(self, mock_delay):
        from apps.data_sources.tasks import schedule_data_source_collections

        source = DataSource.objects.create(
            name="SameTask API",
            type=DataSource.Type.API,
            base_url="https://same.example.com/api",
        )

        schedule_data_source_collections.run("api")

        mock_delay.assert_called_once_with(source.pk)

        mock_delay.reset_mock()

        self.admin = User.objects.create_superuser(
            email="same-admin@example.com",
            password="adminpass123",
        )
        client = APIClient()
        client.force_authenticate(user=self.admin)

        response = client.post(
            f"/api/admin/data-sources/{source.pk}/sync-now/",
            format="json",
        )

        self.assertEqual(response.status_code, drf_status.HTTP_202_ACCEPTED)
        mock_delay.assert_called_once_with(source.pk)

    @patch("apps.data_sources.tasks.collect_data_source.delay")
    def test_type_filter_ignores_other_types(self, mock_delay):
        from apps.data_sources.tasks import schedule_data_source_collections

        api_src = DataSource.objects.create(
            name="Filter API",
            type=DataSource.Type.API,
            base_url="https://filter-api.example.com",
        )
        DataSource.objects.create(
            name="Filter RSS",
            type=DataSource.Type.RSS,
            base_url="https://filter-rss.example.com/feed.xml",
        )
        DataSource.objects.create(
            name="Filter Inactive API",
            type=DataSource.Type.API,
            base_url="https://filter-inactive.example.com",
            is_active=False,
        )

        result = schedule_data_source_collections.run("api")

        self.assertEqual(result["sources_queued"], 1)
        ids = [call.args[0] for call in mock_delay.call_args_list]
        self.assertEqual(ids, [api_src.pk])


# ----------------------------------------------------------------------
# Task 5.11 — Idempotency & fault isolation (NFR, Section 2.5)
# ----------------------------------------------------------------------


class FailingAdapter(BaseAdapter):
    """Test adapter that deliberately fails to test fault isolation."""

    def __init__(self, source):
        self.source = source

    def fetch(self):
        raise Exception("Deliberate adapter failure for testing")

    def normalize(self, raw):
        return normalize_raw_to_schema(raw)


class FaultIsolationTest(TestCase):
    """Task 5.11 — Verify one failing source doesn't block others."""

    def setUp(self):
        # Register the failing adapter temporarily
        from apps.data_sources.adapters.registry import ADAPTER_REGISTRY
        self.original_registry = ADAPTER_REGISTRY.copy()
        ADAPTER_REGISTRY["failing"] = FailingAdapter

        # Create multiple data sources
        self.api_source = DataSource.objects.create(
            name="Working API Source",
            type=DataSource.Type.API,
            base_url="https://working-api.example.com/jobs",
            is_active=True,
        )
        self.rss_source = DataSource.objects.create(
            name="Working RSS Source",
            type=DataSource.Type.RSS,
            base_url="https://working-rss.example.com/feed.xml",
            is_active=True,
        )
        self.failing_source = DataSource.objects.create(
            name="Failing Source",
            type="failing",
            base_url="https://failing.example.com/jobs",
            is_active=True,
        )

    def tearDown(self):
        # Restore original adapter registry
        from apps.data_sources.adapters.registry import ADAPTER_REGISTRY
        ADAPTER_REGISTRY.clear()
        ADAPTER_REGISTRY.update(self.original_registry)

    @patch("apps.data_sources.tasks.collect_data_source.delay")
    def test_one_failing_source_doesnt_block_others(self, mock_delay):
        """When one source fails to queue, others still succeed."""
        # Make the third source fail to queue
        call_count = [0]

        def side_effect(source_id):
            call_count[0] += 1
            if source_id == self.failing_source.id:
                raise Exception("Broker unavailable for this source")
            return mock_delay.return_value

        mock_delay.side_effect = side_effect

        from apps.data_sources.tasks import schedule_data_source_collections

        result = schedule_data_source_collections.run()

        # Should have attempted all 3 sources
        self.assertEqual(call_count[0], 3)

        # 2 succeeded, 1 failed
        self.assertEqual(result["sources_queued"], 2)
        self.assertEqual(result["sources_failed"], 1)
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(
            result["errors"][0]["source_id"],
            self.failing_source.id
        )
        self.assertEqual(
            result["errors"][0]["source_name"],
            "Failing Source"
        )

    @patch("apps.data_sources.adapters.get_adapter")
    def test_adapter_fetch_failure_logged_and_continues(self, mock_get_adapter):
        """When adapter.fetch() fails, error is logged and task returns gracefully."""
        from apps.data_sources.tasks import collect_data_source

        # Mock adapter that fails on fetch
        failing_adapter = FailingAdapter(self.failing_source)
        mock_get_adapter.return_value = failing_adapter

        result = collect_data_source.run(self.failing_source.id)

        # Should return error status, not crash
        self.assertEqual(result["status"], "fetch_failed")
        self.assertEqual(result["source_id"], self.failing_source.id)
        self.assertIn("error", result)

    @patch("apps.data_sources.tasks.store_listing")
    def test_listing_processing_failure_logged_and_continues(
        self, mock_store_listing
    ):
        """When one listing fails to process, others still succeed."""
        from apps.data_sources.tasks import collect_data_source
        from apps.data_sources.adapters.registry import ADAPTER_REGISTRY

        # Register FakeAdapter temporarily for this test
        original_registry = ADAPTER_REGISTRY.copy()
        ADAPTER_REGISTRY[DataSource.Type.API] = FakeAdapter

        try:
            # Make store_listing fail on the second listing
            call_count = [0]

            def side_effect(*args, **kwargs):
                call_count[0] += 1
                if call_count[0] == 2:
                    raise Exception("Processing error")
                from apps.data_sources.services.dedupe import StoreResult
                from apps.internships.models import Internship
                return StoreResult(action="created", internship=Internship())

            mock_store_listing.side_effect = side_effect

            result = collect_data_source.run(self.api_source.id)

            # Should process both listings, with one error
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["records_found"], 2)
            self.assertEqual(result["records_created"], 1)
            self.assertEqual(result["records_processing_errors"], 1)
        finally:
            # Restore original registry
            ADAPTER_REGISTRY.clear()
            ADAPTER_REGISTRY.update(original_registry)


# ----------------------------------------------------------------------
# Phase 5 Definition of Done — TC011
# ----------------------------------------------------------------------


class Phase5DefinitionOfDoneTest(TestCase):
    """Phase 5 DoD: Full scheduled pipeline produces normalized, deduplicated,
    URL-validated, non-expired Internship rows with zero manual intervention."""

    def setUp(self):
        # Create active data sources with FakeAdapter for testing
        self.api_source = DataSource.objects.create(
            name="Test API Source",
            type=DataSource.Type.API,
            base_url="https://test-api.example.com/jobs",
            is_active=True,
        )
        self.rss_source = DataSource.objects.create(
            name="Test RSS Source",
            type=DataSource.Type.RSS,
            base_url="https://test-rss.example.com/feed.xml",
            is_active=True,
        )

        # Register FakeAdapter for these sources
        from apps.data_sources.adapters.registry import ADAPTER_REGISTRY
        self.original_registry = ADAPTER_REGISTRY.copy()
        ADAPTER_REGISTRY[DataSource.Type.API] = FakeAdapter
        ADAPTER_REGISTRY[DataSource.Type.RSS] = FakeAdapter

    def tearDown(self):
        # Restore original adapter registry
        from apps.data_sources.adapters.registry import ADAPTER_REGISTRY
        ADAPTER_REGISTRY.clear()
        ADAPTER_REGISTRY.update(self.original_registry)

    def test_tc011_full_scheduled_pipeline(self):
        """TC011: Full scheduled pipeline runs end-to-end with mock sources."""
        from apps.data_sources.tasks import schedule_data_source_collections, collect_data_source

        # Run the scheduled collection for all active sources
        result = schedule_data_source_collections.run()

        # Verify both sources were queued
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["sources_queued"], 2)
        self.assertEqual(result["sources_failed"], 0)
        self.assertEqual(len(result["errors"]), 0)

        # Run collect_data_source directly for one source (eager mode)
        api_result = collect_data_source.run(self.api_source.id)

        # Verify successful collection
        self.assertEqual(api_result["status"], "success")
        self.assertEqual(api_result["source_id"], self.api_source.id)
        self.assertEqual(api_result["source_type"], DataSource.Type.API)
        self.assertGreater(api_result["records_found"], 0)

        # Verify the pipeline processed listings (created, duplicate, or near-duplicate)
        total_processed = (
            api_result["records_created"]
            + api_result["records_duplicate"]
            + api_result["records_near_duplicate"]
        )
        self.assertGreater(total_processed, 0)
        self.assertEqual(api_result["records_processing_errors"], 0)

        # Verify data source was updated
        self.api_source.refresh_from_db()
        self.assertIsNotNone(self.api_source.last_synced_at)
