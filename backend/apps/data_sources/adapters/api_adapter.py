"""
Concrete adapter for public internship REST APIs (DataSource.Type.API).

The adapter pulls listings from a JSON endpoint configured on the
``DataSource`` (``base_url`` plus optional per-source ``config`` such
as an API key, headers, or the JSON path that holds the listings), maps
external fields (``title``, ``company_name``, ``description``,
``skills``, ``application_url``, ``deadline``) onto the internal
Task 1.5 schema, and respects rate limits with exponential-backoff
retry (Section 2.8).
"""

from .base import (
    BaseAdapter,
    RawListing,
    normalize_raw_to_schema,
)
from .http import HTTPFetcher


class APIAdapter(BaseAdapter):
    """
    Adapter for a single HTTP/JSON internship source.

    The ``config`` JSON on the ``DataSource`` may override defaults::

        {
            "results_path": "jobs",           # dotted path to the list
            "headers": {"Authorization": "..."},
            "params": {"category": "software-dev"},
            "timeout_seconds": 15,
            "max_retries": 3,                 # additional attempts
            "backoff_base_seconds": 1.0,      # exponential base
            "min_request_interval": 0.5,      # pacing between calls
            "field_map": {"title": "name"},   # external field overrides
        }

    Retry behaviour (Section 2.8) is delegated to ``HTTPFetcher``:
    HTTP ``429`` and any ``5xx`` are retried with exponential backoff,
    honouring the ``Retry-After`` header when present.
    """

    def __init__(self, source):
        self.source = source
        self._fetcher = HTTPFetcher(source.config or {})

    # ------------------------------------------------------------------
    # base contract
    # ------------------------------------------------------------------

    def fetch(self) -> list[RawListing]:
        """
        Call the configured API and map each JSON job onto a
        ``RawListing`` dictionary.
        """
        url = self.source.base_url
        if not url:
            raise ValueError(
                "APIAdapter requires a base_url on the DataSource."
            )

        config = self.source.config or {}
        response = self._fetcher.get(url)
        payload = response.json()
        items = self._extract_listings(payload, config)

        return [self._map_listing(item, config) for item in items]

    def normalize(self, raw: RawListing) -> dict:
        """
        Map one raw API listing onto the internal Task 1.5 schema.
        """
        return normalize_raw_to_schema(raw, is_verified=True, status="active")

    # ------------------------------------------------------------------
    # payload handling
    # ------------------------------------------------------------------

    def _extract_listings(self, payload, config):
        """
        Locate the listing list inside a JSON payload. Defaults to the
        payload itself, then to common envelope keys, then to the
        configured dotted ``results_path``.
        """
        path = config.get("results_path")

        if not path:
            if isinstance(payload, list):
                return payload
            for key in ("jobs", "results", "data", "listings"):
                if isinstance(payload.get(key), list):
                    return payload[key]
            raise ValueError(
                "API endpoint did not return a list of listings."
            )

        current = payload

        for key in str(path).split("."):
            if not isinstance(current, dict) or key not in current:
                raise ValueError(
                    f"results_path '{path}' not found in payload."
                )
            current = current[key]

        if not isinstance(current, list):
            raise ValueError(
                f"results_path '{path}' did not resolve to a list."
            )

        return current

    def _map_listing(self, item, config) -> RawListing:
        """
        Map one source-specific JSON object onto the ``RawListing``
        shape. External field names (``title``, ``company_name``,
        ``description``, ``skills``, ``application_url``, ``deadline``)
        are resolved first; per-source aliases can be provided through
        the ``config`` ``"field_map"`` dictionary.
        """
        field_map = config.get("field_map") or {}

        def external(internal_key, *fallbacks):
            names = (
                [field_map.get(internal_key, internal_key)]
                + list(fallbacks)
            )
            for name in names:
                value = item.get(name)
                if value not in (None, ""):
                    return value
            return None

        # Resolve application URL with fallbacks (apply_options, employer_website, job_google_link)
        application_url = external(
            "application_url", "url", "apply_url", "job_apply_link"
        )
        if not application_url and isinstance(item.get("apply_options"), list) and item["apply_options"]:
            first_opt = item["apply_options"][0]
            if isinstance(first_opt, dict) and first_opt.get("apply_link"):
                application_url = first_opt["apply_link"]

        if not application_url:
            application_url = external(
                "job_google_link", "employer_website", "company_url", "website"
            )

        # Normalize application URL
        if application_url and isinstance(application_url, str):
            application_url = application_url.strip()
            if application_url and not application_url.startswith(("http://", "https://")):
                application_url = f"https://{application_url}"

        source_url = external("source_url", "job_google_link", "url") or application_url
        if source_url and isinstance(source_url, str):
            source_url = source_url.strip()
            if source_url and not source_url.startswith(("http://", "https://")):
                source_url = f"https://{source_url}"

        external_id = (
            external("external_id", "id", "job_id")
            or application_url
            or external("title", "job_title")
        )

        # Extract skills / tags
        raw_skills = external("required_skills", "skills", "tags", "keywords", "job_required_skills") or []
        if isinstance(raw_skills, str):
            required_skills = [s.strip() for s in raw_skills.split(",") if s.strip()]
        elif isinstance(raw_skills, list):
            required_skills = []
            for s in raw_skills:
                if isinstance(s, str):
                    required_skills.append(s.strip())
                elif isinstance(s, dict) and s.get("name"):
                    required_skills.append(str(s["name"]).strip())
        else:
            required_skills = []

        # If qualifications list in highlights, extract key skills if required_skills is empty
        if not required_skills and isinstance(item.get("job_highlights"), dict):
            quals = item["job_highlights"].get("Qualifications") or []
            if isinstance(quals, list):
                required_skills = [str(q).strip() for q in quals[:5] if q]

        # Extract company name
        org_name = external(
            "organization_name",
            "company_name",
            "company",
            "employer_name",
            "hiring_organization_name",
        ) or ""

        # Extract location
        location_text = external(
            "location_text", "location", "job_location", "candidate_required_location"
        ) or ""
        country = external("country", "job_country") or ""
        city = external("city", "job_city") or ""

        # Determine internship/work mode
        job_type = str(external("internship_type", "job_employment_type", "employment_types") or "").lower()
        if "remote" in job_type or "remote" in location_text.lower() or item.get("job_is_remote"):
            internship_type = "remote"
        elif "hybrid" in job_type:
            internship_type = "hybrid"
        else:
            internship_type = "onsite"

        return {
            "external_id": str(external_id or ""),
            "title": external("title", "job_title", "role") or "",
            "organization_name": org_name,
            "description": external("description", "job_description", "summary") or "",
            "category": external("category", "job_category") or "",
            "country": country,
            "city": city,
            "location_text": location_text,
            "internship_type": internship_type,
            "work_type": (
                external("work_type") or "full_time"
            ),
            "compensation_type": (
                external("compensation_type") or "unknown"
            ),
            "minimum_compensation": external(
                "minimum_compensation", "job_min_salary"
            ),
            "maximum_compensation": external(
                "maximum_compensation", "job_max_salary"
            ),
            "compensation_currency": external(
                "compensation_currency", "job_salary_currency"
            ) or "",
            "compensation_period": external(
                "compensation_period", "job_salary_period"
            ) or "",
            "required_skills": required_skills,
            "preferred_skills": external("preferred_skills") or [],
            "duration_min_weeks": external("duration_min_weeks"),
            "duration_max_weeks": external("duration_max_weeks"),
            "application_url": application_url or "",
            "source_url": source_url or "",
            "posted_at": external(
                "posted_at", "posted_date", "posted", "job_posted_at_datetime_utc", "publication_date"
            ),
            "application_deadline": external(
                "application_deadline", "deadline", "due", "job_expiry_datetime_utc"
            ),
        }