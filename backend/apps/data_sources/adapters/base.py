"""
Base adapter interface for external internship data sources.

Every concrete adapter (API, RSS, career-site) implements this
interface, so the collection pipeline can treat all sources
uniformly. This is the per-source adapter contract described in
Section 2.5 (maintainability).
"""

from abc import ABC, abstractmethod
from typing import Any, TypedDict


class RawListing(TypedDict):
    """
    A raw, un-normalized listing as returned by an external source.

    Concrete adapters expose source-specific payloads through
    ``fetch()`` as a list of these dictionaries. The ``normalize()``
    method then maps them onto the internal schema from Task 1.5.
    """

    external_id: str
    title: str
    organization_name: str
    description: str
    category: str
    country: str
    city: str
    location_text: str
    internship_type: str
    work_type: str
    compensation_type: str
    minimum_compensation: object
    maximum_compensation: object
    compensation_currency: str
    compensation_period: str
    required_skills: list
    preferred_skills: list
    duration_min_weeks: object
    duration_max_weeks: object
    application_url: str
    source_url: str
    posted_at: object
    application_deadline: object


# The exact internal schema fields produced by normalize() (Task 1.5).
# Kept as the single source of truth so concrete adapters and the
# FakeAdapter stay consistent with the pipeline.
SCHEMA_FIELDS = [
    "title",
    "organization_name",
    "description",
    "category",
    "country",
    "city",
    "location_text",
    "internship_type",
    "work_type",
    "compensation_type",
    "minimum_compensation",
    "maximum_compensation",
    "compensation_currency",
    "compensation_period",
    "required_skills",
    "preferred_skills",
    "duration_min_weeks",
    "duration_max_weeks",
    "application_url",
    "source_url",
    "external_id",
    "posted_at",
    "application_deadline",
    "is_verified",
    "status",
]


def normalize_raw_to_schema(
    raw,
    *,
    is_verified=False,
    status="draft",
):
    """
    Map one ``RawListing`` onto the exact Task 1.5 internal schema.

    Every concrete adapter implements ``normalize(raw)`` by delegating
    to this helper, so a normalized listing always carries exactly the
    ``SCHEMA_FIELDS`` keys — regardless of which source produced it.

    Args:
        raw: One ``RawListing`` as produced by ``fetch()``.
        is_verified: Verification flag written to the schema.
            Defaults to ``False`` (new listings start unverified).
        status: Publication status written to the schema.
            Defaults to ``"draft"`` (new listings require admin approval).

    Returns:
        A dictionary containing exactly the Task 1.5 ``SCHEMA_FIELDS``.
    """

    def _clean(value):
        """Trim whitespace on strings, pass other values through."""
        if isinstance(value, str):
            return value.strip()
        return value

    return {
        "title": _clean(raw.get("title", "")),
        "organization_name": _clean(
            raw.get("organization_name", "")
        ),
        "description": _clean(
            raw.get("description", "")
        ),
        "category": _clean(raw.get("category", "")),
        "country": _clean(raw.get("country", "")),
        "city": _clean(raw.get("city", "")),
        "location_text": _clean(
            raw.get("location_text", "")
        ),
        "internship_type": raw.get(
            "internship_type", "onsite"
        ),
        "work_type": raw.get(
            "work_type", "full_time"
        ),
        "compensation_type": raw.get(
            "compensation_type", "unknown"
        ),
        "minimum_compensation": raw.get(
            "minimum_compensation"
        ),
        "maximum_compensation": raw.get(
            "maximum_compensation"
        ),
        "compensation_currency": raw.get(
            "compensation_currency", ""
        ),
        "compensation_period": raw.get(
            "compensation_period", ""
        ),
        "required_skills": raw.get(
            "required_skills", []
        ),
        "preferred_skills": raw.get(
            "preferred_skills", []
        ),
        "duration_min_weeks": raw.get(
            "duration_min_weeks"
        ),
        "duration_max_weeks": raw.get(
            "duration_max_weeks"
        ),
        "application_url": _clean(
            raw.get("application_url", "")
        ),
        "source_url": _clean(raw.get("source_url", "")),
        "external_id": str(raw.get("external_id", "")),
        "posted_at": raw.get("posted_at"),
        "application_deadline": raw.get(
            "application_deadline"
        ),
        "is_verified": is_verified,
        "status": status,
    }


class BaseAdapter(ABC):
    """
    Abstract contract implemented by every data source adapter.

    Responsibilities:
      - ``fetch()``       -> pull raw listings from the external source
      - ``normalize(raw)`` -> map one raw listing onto the internal
                              Task 1.5 schema dict

    Concrete subclasses must implement both methods.
    """

    @abstractmethod
    def fetch(self) -> list[RawListing]:
        """
        Fetch raw internship listings from the external source.

        Returns a list of ``RawListing`` dictionaries in the
        source's native shape.
        """
        raise NotImplementedError(
            "Subclasses must implement fetch()."
        )

    @abstractmethod
    def normalize(self, raw: RawListing) -> dict:
        """
        Normalize a single raw listing into the internal schema.

        Args:
            raw: One raw listing as produced by ``fetch()``.

        Returns:
            A dictionary with the exact Task 1.5 internal schema
            fields (see ``SCHEMA_FIELDS``).
        """
        raise NotImplementedError(
            "Subclasses must implement normalize()."
        )
