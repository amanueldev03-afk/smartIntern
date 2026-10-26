"""
Fake adapter for testing purposes (Task 5.2).

Returns hardcoded listings to validate the adapter contract without
requiring external API calls or network access during tests.
"""

from typing import List
from .base import BaseAdapter, RawListing, normalize_raw_to_schema


class FakeAdapter(BaseAdapter):
    """
    Test-only adapter that returns two hardcoded raw listings.

    Used in test suites to verify the adapter contract without
    external dependencies. Implements fetch() and normalize() as
    defined in BaseAdapter.
    """

    def fetch(self) -> List[RawListing]:
        """
        Return exactly 2 hardcoded raw listings with complete schema fields.

        Returns:
            List[RawListing]: Two fake internship listings.
        """
        return [
            {
                "external_id": "FAKE-001",
                "title": "Python Backend Intern",
                "organization_name": "Fake Technology",
                "description": "Backend development internship focusing on Python/Django.",
                "application_url": "https://fake.example.com/apply/001",
                "source_url": "https://fake.example.com/listing/001",
                "country": "Ethiopia",
                "city": "Addis Ababa",
                "minimum_compensation": 300,
                "maximum_compensation": 600,
                "compensation_type": "monthly",
                "compensation_currency": "USD",
                "required_skills": ["Python", "Django", "PostgreSQL"],
                "start_date": "2025-06-01",
                "end_date": "2025-08-31",
                "duration_months": 3,
                "work_mode": "remote",
                "internship_type": "full_time",
            },
            {
                "external_id": "FAKE-002",
                "title": "Frontend React Intern",
                "organization_name": "Fake Innovations",
                "description": "Frontend internship working with React and TypeScript.",
                "application_url": "https://fake.example.com/apply/002",
                "source_url": "https://fake.example.com/listing/002",
                "country": "Kenya",
                "city": "Nairobi",
                "minimum_compensation": 400,
                "maximum_compensation": 700,
                "compensation_type": "monthly",
                "compensation_currency": "USD",
                "required_skills": ["React", "TypeScript", "CSS"],
                "start_date": "2025-07-01",
                "end_date": "2025-09-30",
                "duration_months": 3,
                "work_mode": "hybrid",
                "internship_type": "part_time",
            },
        ]

    def normalize(self, raw: RawListing) -> dict:
        """
        Normalize a raw listing into the Task 1.5 schema.

        Uses the base normalize_raw_to_schema helper to ensure
        schema compliance. All required fields are mapped, missing
        fields get safe defaults, and pipeline status is set to
        'draft' with is_verified=False.

        Args:
            raw: Raw listing dictionary from fetch().

        Returns:
            dict: Normalized listing with all SCHEMA_FIELDS keys.
        """
        return normalize_raw_to_schema(raw)
