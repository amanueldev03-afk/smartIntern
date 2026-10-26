"""
Concrete adapter for RSS/Atom internship feeds (DataSource.Type.RSS,
Section 3.10.3, Figure 3.10).

Downloads the feed (via the shared rate-limited ``HTTPFetcher``) and
parses it with ``feedparser``. Every item/entry is mapped onto the
``RawListing`` shape and normalized onto the Task 1.5 schema, feeding
the same ``normalize -> validate -> dedupe -> store`` pipeline used by
the other per-source adapters (Task 5.2/5.3).
"""

import feedparser

from .base import (
    BaseAdapter,
    RawListing,
    normalize_raw_to_schema,
)
from .http import HTTPFetcher


class RSSAdapter(BaseAdapter):
    """
    Adapter for a single RSS/Atom internship feed.

    The ``config`` JSON on the ``DataSource`` may override defaults::

        {
            "company_field": "author",   # entry key holding the company
            "application_link_field": "link",
        }
    """

    def __init__(self, source):
        self.source = source
        self._fetcher = HTTPFetcher(source.config or {})

    # ------------------------------------------------------------------
    # base contract
    # ------------------------------------------------------------------

    def fetch(self) -> list[RawListing]:
        """
        Download the feed and map each item/entry onto a
        ``RawListing`` dictionary.
        """
        url = self.source.base_url
        if not url:
            raise ValueError(
                "RSSAdapter requires a base_url on the DataSource."
            )

        config = self.source.config or {}
        response = self._fetcher.get(url)
        feed = feedparser.parse(response.content)

        if feed.bozo and not feed.entries:
            raise ValueError(
                f"Feed could not be parsed: {feed.bozo_exception}"
            )

        return [
            self._map_entry(entry, config) for entry in feed.entries
        ]

    def normalize(self, raw: RawListing) -> dict:
        """
        Map one raw feed entry onto the internal Task 1.5 schema.
        """
        return normalize_raw_to_schema(raw)

    # ------------------------------------------------------------------
    # entry mapping
    # ------------------------------------------------------------------

    def _map_entry(self, entry, config) -> RawListing:
        """
        Map one feedparser entry onto the ``RawListing`` shape.
        """
        link = entry.get("link") or ""
        title = entry.get("title") or ""
        description = (
            entry.get("summary")
            or entry.get("description")
            or ""
        )
        external_id = (
            entry.get("id")
            or entry.get("guid")
            or link
            or title
        )
        posted_at = (
            entry.get("published")
            or entry.get("updated")
        )

        company_field = config.get("company_field")
        organization_name = (
            (entry.get(company_field) if company_field else "")
            or entry.get("author")
            or entry.get("creator")
            or self._company_from_title(title)
        )

        application_field = config.get("application_link_field", "link")
        application_url = entry.get(application_field) or link

        return {
            "external_id": str(external_id),
            "title": title,
            "organization_name": organization_name or "",
            "description": description,
            "category": self._category(entry),
            "country": "",
            "city": "",
            "location_text": "",
            "internship_type": "remote",
            "work_type": "full_time",
            "compensation_type": "unknown",
            "minimum_compensation": None,
            "maximum_compensation": None,
            "compensation_currency": "",
            "compensation_period": "",
            "required_skills": [],
            "preferred_skills": [],
            "duration_min_weeks": None,
            "duration_max_weeks": None,
            "application_url": application_url,
            "source_url": link,
            "posted_at": posted_at,
            "application_deadline": None,
        }

    @staticmethod
    def _category(entry):
        """Use the first tag term as the category when available."""
        tags = entry.get("tags") or []
        if tags:
            return tags[0].get("term", "")
        return entry.get("category", "")

    @staticmethod
    def _company_from_title(title):
        """
        Best-effort company extraction for feeds that prefix the role
        with the company name, e.g. "Acme Corp — Backend Intern".
        """
        for separator in (" — ", " - ", " at "):
            if separator in title:
                return title.split(separator, 1)[0].strip()
        return ""