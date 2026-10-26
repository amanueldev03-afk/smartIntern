"""
Concrete adapter for trusted company career websites
(DataSource.Type.CAREER_SITE, Section 3.10.4).

Only hostnames on the explicit ``ALLOWED_CAREER_SITES`` allow-list are
scraped — "trusted company websites only". No open/generic crawling:
each allow-listed company is configured with its own CSS selectors
(config-driven), and a per-``DataSource`` ``config`` JSON may override
them. Listings are normalized onto the Task 1.5 schema.
"""

from urllib.parse import urljoin, urlparse

from django.conf import settings
from lxml import html

from .base import (
    BaseAdapter,
    RawListing,
    normalize_raw_to_schema,
)
from .http import HTTPFetcher


class CareerSiteAdapter(BaseAdapter):
    """
    Simple structured scraper for one allow-listed company careers page.

    The ``config`` JSON on the ``DataSource`` (and/or the allow-list
    entry in ``ALLOWED_CAREER_SITES``) supplies the selectors used to
    extract fields from the HTML::

        {
            "container_selector": "li.job",
            "field_selectors": {
                "title": ".job-title",
                "link": "a",
                "description": ".description",
                "deadline": ".application-deadline",
                "location": ".location",
            },
        }
    """

    DEFAULTS = {
        "container_selector": "li.job, .job, .job-listing",
        "field_selectors": {
            "title": ".job-title, .title, h2, h3",
            "link": "a",
            "description": ".description, .job-description",
            "deadline": ".deadline, .application-deadline",
            "location": ".location, .location-text",
        },
    }

    def __init__(self, source):
        self.source = source
        self._fetcher = HTTPFetcher(source.config or {})

    # ------------------------------------------------------------------
    # base contract
    # ------------------------------------------------------------------

    def fetch(self) -> list[RawListing]:
        """
        Download the allow-listed careers page and map each job block
        onto a ``RawListing`` dictionary.
        """
        url = self.source.base_url
        if not url:
            raise ValueError(
                "CareerSiteAdapter requires a base_url on the "
                "DataSource."
            )

        selectors = self._effective_config(url)
        response = self._fetcher.get(url)

        if response.encoding is None:
            response.encoding = response.apparent_encoding

        doc = html.fromstring(response.text)
        blocks = doc.cssselect(selectors.get("container_selector"))

        return [
            self._map_block(block, selectors) for block in blocks
        ]

    def normalize(self, raw: RawListing) -> dict:
        """
        Map one raw career-site block onto the internal schema.
        """
        return normalize_raw_to_schema(raw)

    # ------------------------------------------------------------------
    # allow-list enforcement (Section 3.10.4)
    # ------------------------------------------------------------------

    @staticmethod
    def _hostname(url):
        return (urlparse(url).hostname or "").lower()

    def _effective_config(self, url):
        """
        Resolve the effective scraper config for the target host.

        Only hosts in ``settings.ALLOWED_CAREER_SITES`` may be scraped.
        The per-company allow-list config and the per-``DataSource``
        ``config`` override the defaults.
        """
        host = self._hostname(url)
        allow_list = settings.ALLOWED_CAREER_SITES

        if host not in allow_list:
            raise PermissionError(
                f"Host '{host}' is not on the trusted career-site "
                f"allow-list; open scraping is disabled "
                f"(Section 3.10.4)."
            )

        allowed_config = allow_list[host] or {}
        source_config = self.source.config or {}

        return {
            **self.DEFAULTS,
            **allowed_config,
            **source_config,
        }

    # ------------------------------------------------------------------
    # block mapping
    # ------------------------------------------------------------------

    def _map_block(self, block, selectors) -> RawListing:
        """
        Extract fields from one HTML job listing block.
        """
        field_selectors = selectors.get("field_selectors") or {}

        def first(css):
            nodes = block.cssselect(css)
            if not nodes:
                return ""
            return " ".join(nodes[0].text_content().split())

        def link():
            css = field_selectors.get("link", "a")
            nodes = block.cssselect(css)
            if nodes:
                href = nodes[0].get("href") or ""
                return urljoin(self.source.base_url, href)
            return ""

        application_url = link()
        title = first(field_selectors.get("title", "h2"))
        description = first(
            field_selectors.get("description", ".description")
        )
        deadline = first(
            field_selectors.get("deadline", ".deadline")
        )
        location_text = first(
            field_selectors.get("location", ".location")
        )

        return {
            "external_id": application_url or title,
            "title": title,
            "organization_name": (
                self.source.name
            ),
            "description": description,
            "category": "",
            "country": "",
            "city": "",
            "location_text": location_text,
            "internship_type": "onsite",
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
            "source_url": application_url,
            "posted_at": "",
            "application_deadline": deadline,
        }