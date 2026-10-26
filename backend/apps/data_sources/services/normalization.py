"""
services/normalization.py — Shared listing normalisation (Section 3.10.5).

``normalize_listing(raw, source_type)`` is the pipeline-level normaliser
applied after an adapter maps an external payload onto the Task 1.5
schema. It:

  - trims / collapses whitespace on every string field,
  - strips HTML markup from descriptions,
  - standardizes location strings through a small country/city lookup
    (e.g. ``"  Addis Ababa, ethiopia  "`` -> country ``"Ethiopia"``,
    city ``"Addis Ababa"``, location_text ``"Addis Ababa, Ethiopia"``),
  - maps skill text onto catalogue ``Skill`` rows — exact match first,
    fuzzy match as a fallback — flagging every low-confidence match
    (fuzzy or unmatched) for the Task 5.9 admin review.
"""

import hashlib
import re
from difflib import SequenceMatcher

from ..adapters.base import normalize_raw_to_schema


# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------

# Fuzzy matches at/above this ratio are accepted as a candidate Skill;
# they are still flagged (low_confidence=True) for admin review.
FUZZY_MATCH_THRESHOLD = 0.85

# Small country / city lookup used to standardize location strings.
# Keyed by lowercase alias -> canonical display name.
COUNTRIES = {
    "ethiopia": "Ethiopia",
    "et": "Ethiopia",
    "kenya": "Kenya",
    "ke": "Kenya",
    "nigeria": "Nigeria",
    "ng": "Nigeria",
    "ghana": "Ghana",
    "south africa": "South Africa",
    "za": "South Africa",
    "india": "India",
    "in": "India",
    "germany": "Germany",
    "de": "Germany",
    "france": "France",
    "fr": "France",
    "united kingdom": "United Kingdom",
    "great britain": "United Kingdom",
    "uk": "United Kingdom",
    "united states": "United States",
    "united states of america": "United States",
    "usa": "United States",
    "u.s.a.": "United States",
    "us": "United States",
    "canada": "Canada",
    "ca": "Canada",
    "australia": "Australia",
    "au": "Australia",
    "brazil": "Brazil",
    "br": "Brazil",
}

CITIES = {
    "addis ababa": "Addis Ababa",
    "addis abeba": "Addis Ababa",
    "addis": "Addis Ababa",
    "nairobi": "Nairobi",
    "lagos": "Lagos",
    "accra": "Accra",
    "london": "London",
    "berlin": "Berlin",
    "new york": "New York",
    "new york city": "New York",
    "nyc": "New York",
    "san francisco": "San Francisco",
    "toronto": "Toronto",
    "mumbai": "Mumbai",
    "bengaluru": "Bengaluru",
    "bangalore": "Bengaluru",
}


# ----------------------------------------------------------------------
# Text helpers
# ----------------------------------------------------------------------

def _clean(value):
    """Trim and collapse whitespace on ``value``."""
    if value is None:
        return ""
    return " ".join(str(value).split())


def compute_content_hash(title, organization_name, application_url):
    """
    SHA-256 fingerprint of ``title + company + application_url`` used
    for exact duplicate detection (Section 3.10.5/3.10.6).

    The inputs are normalized (lowercased, whitespace-collapsed) so that
    cosmetic differences such as extra spaces or tag case do not break
    the exact match.
    """
    parts = [
        _clean(title).lower(),
        _clean(organization_name).lower(),
        _clean(application_url).lower(),
    ]
    payload = "|".join(parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def strip_html(text):
    """
    Remove HTML markup from a string, keeping the visible text and
    resolving entities (``&amp;`` -> ``&``).
    """
    if not text:
        return ""

    try:
        from lxml.html import fromstring
        return " ".join(fromstring(text).text_content().split())
    except Exception:
        return " ".join(re.sub(r"<[^>]+>", " ", text).split())


# ----------------------------------------------------------------------
# Location standardisation
# ----------------------------------------------------------------------

def _canonical(value, lookup):
    """Canonical display name via ``lookup``, else the cleaned value."""
    key = _clean(value).lower()
    if key in lookup:
        return lookup[key]
    return _clean(value)


def _parse_location(text):
    """
    Split a ``"City, Country"`` (or ``"City, Region, Country"``) string
    into ``(city, country)``. Returns ``("", "")`` for a single-part
    value (e.g. ``"Remote"``) so plain location strings are untouched.
    """
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if len(parts) < 2:
        return "", ""

    country = COUNTRIES.get(parts[-1].lower(), parts[-1])
    return parts[0], country


def _standardize_location(country, city, location_text):
    """
    Normalize the country/city/location_text trio through the lookup,
    parsing a combined ``"City, Country"`` string when present.
    """
    country = _clean(country)
    city = _clean(city)
    location_text = _clean(location_text)

    combined = location_text
    if not combined and "," in city:
        combined = city
    if not combined and "," in country:
        combined = country

    parsed_city, parsed_country = "", ""
    if combined:
        parsed_city, parsed_country = _parse_location(combined)

    if parsed_country:
        country = parsed_country
        city = parsed_city
    else:
        country = _canonical(country, COUNTRIES)
        city = _canonical(city, CITIES)

    country = _canonical(country, COUNTRIES)
    city = _canonical(city, CITIES)

    display_parts = [p for p in (city, country) if p]
    standardized_text = ", ".join(display_parts)

    return country, city, standardized_text or location_text


# ----------------------------------------------------------------------
# Skill catalogue mapping
# ----------------------------------------------------------------------

def _as_skill_list(value):
    """Coerce a skills field into a cleaned list of skill names."""
    if value is None:
        return []

    if isinstance(value, str):
        parts = value.split(",")
    elif isinstance(value, (list, tuple)):
        parts = value
    else:
        parts = []

    return [_clean(p) for p in parts if _clean(p)]


def _skill_key(name):
    """Normalized key used for exact matching."""
    return _clean(name).lower()


def _best_fuzzy(key, candidates):
    """
    Best fuzzy candidate for ``key`` among ``(skill, candidate_key)``
    pairs. Returns ``(skill, score)``.
    """
    best = None
    best_score = 0.0

    for skill, candidate_key in candidates:
        if not candidate_key:
            continue
        score = SequenceMatcher(None, key, candidate_key).ratio()
        if score > best_score:
            best_score = score
            best = skill

    return best, best_score


def _map_skills(skill_texts):
    """
    Map skill texts onto catalogue ``Skill`` rows.

    Returns a dict with:
      - matched_names: names of matched catalogue skills
      - matched_ids:   primary keys of those skills
      - review:        low-confidence entries for the Task 5.9 admin
                       review (fuzzy matches and unmatched texts)
    """
    from apps.internships.models import Skill

    skills = list(Skill.objects.filter(is_active=True))
    by_name = {_skill_key(skill.name): skill for skill in skills}
    fuzzy_candidates = [
        (skill, _skill_key(skill.name)) for skill in skills
    ]

    matched_names = []
    matched_ids = []
    review = []

    for text in skill_texts:
        key = _skill_key(text)
        skill = by_name.get(key)

        if skill is not None:
            matched_names.append(skill.name)
            matched_ids.append(skill.id)
            continue

        best, score = _best_fuzzy(key, fuzzy_candidates)

        if best is not None and score >= FUZZY_MATCH_THRESHOLD:
            matched_names.append(best.name)
            matched_ids.append(best.id)
            review.append(
                {
                    "text": text,
                    "matched_skill": best.name,
                    "matched_skill_id": best.id,
                    "method": "fuzzy",
                    "score": round(score, 3),
                    "low_confidence": True,
                }
            )
        else:
            review.append(
                {
                    "text": text,
                    "matched_skill": None,
                    "matched_skill_id": None,
                    "method": None,
                    "score": None,
                    "low_confidence": True,
                }
            )

    return {
        "matched_names": matched_names,
        "matched_ids": matched_ids,
        "review": review,
    }


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

def normalize_listing(raw, source_type=None):
    """
    Normalize one raw listing into clean, consistent pipeline output.

    Args:
        raw: A ``RawListing`` produced by an adapter's ``fetch()``.
        source_type: The ``DataSource.Type`` that produced the listing.
            Recorded on the output for pipeline auditing.

    Returns:
        A dict with all Task 1.5 ``SCHEMA_FIELDS`` (cleaned and
        standardized) plus pipeline metadata:
          - ``content_hash``: SHA-256 of title+company+application_url
          - ``required_skill_ids``: matched catalogue Skill primary keys
          - ``skills_review``: low-confidence matches for admin review
          - ``source_type``: recorded source that produced the listing
    """
    data = normalize_raw_to_schema(raw)

    for key, value in data.items():
        if isinstance(value, str):
            data[key] = _clean(value)

    data["description"] = strip_html(data.get("description") or "")

    app_url = data.get("application_url") or ""
    if app_url and not app_url.startswith(("http://", "https://")):
        data["application_url"] = f"https://{app_url}"

    src_url = data.get("source_url") or ""
    if src_url and not src_url.startswith(("http://", "https://")):
        data["source_url"] = f"https://{src_url}"

    country, city, location_text = _standardize_location(
        data.get("country") or "",
        data.get("city") or "",
        data.get("location_text") or "",
    )
    data["country"] = country
    data["city"] = city
    data["location_text"] = location_text

    required_skills = _as_skill_list(data.get("required_skills") or [])
    preferred_skills = _as_skill_list(data.get("preferred_skills") or [])

    skill_result = _map_skills(required_skills)
    data["required_skills"] = skill_result["matched_names"]
    data["required_skill_ids"] = skill_result["matched_ids"]
    data["preferred_skills"] = preferred_skills
    data["skills_review"] = skill_result["review"]
    data["content_hash"] = compute_content_hash(
        data.get("title") or "",
        data.get("organization_name") or "",
        data.get("application_url") or "",
    )
    data["source_type"] = source_type

    return data