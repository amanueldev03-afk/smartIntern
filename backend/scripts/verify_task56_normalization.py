"""
Verification script for Task 5.6 — Shared listing normalisation
(Section 3.10.5).

Checks:
1. ``normalize_listing`` trims/collapses whitespace on string fields and
   strips HTML markup from descriptions.
2. Location strings are standardized through the country/city lookup
   (e.g. ``"  Addis Ababa, ethiopia  "`` -> country ``"Ethiopia"``,
   city ``"Addis Ababa"``, location_text ``"Addis Ababa, Ethiopia"``).
3. Skill text maps onto catalogue ``Skill`` rows: exact match first,
   fuzzy match as a fallback (``difflib.SequenceMatcher`` above the
   configured threshold). Every fuzzy/unmatched skill is flagged in
   ``skills_review`` for the Task 5.9 admin review.
4. Output remains a superset of the Task 1.5 schema, records the
   source type, and feeds the pipeline as an unverified draft.
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.data_sources.adapters import SCHEMA_FIELDS
from apps.data_sources.services.normalization import (
    FUZZY_MATCH_THRESHOLD,
    normalize_listing,
    strip_html,
)
from apps.internships.models import Skill


def run_checks():
    print("=" * 60)
    print("TASK 5.6 VERIFICATION: Shared listing normalisation")
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

    python, _ = Skill.objects.get_or_create(
        name="Python",
        defaults={"category": "Programming Languages"},
    )
    javascript, _ = Skill.objects.get_or_create(
        name="JavaScript",
        defaults={"category": "Programming Languages"},
    )
    django_skill, _ = Skill.objects.get_or_create(
        name="Django",
        defaults={"category": "Frameworks"},
    )

    raw = {
        "external_id": "NORM-001",
        "title": "  Backend  Data  Intern  ",
        "organization_name": "Example Corp",
        "description": (
            "<div><h2>Data Intern</h2> <p>Work with <b>pandas</b> "
            "&amp; SQL.</p></div>"
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
        "required_skills": ["  Python ", "Django", "Java Script"],
        "preferred_skills": [" React ", "Tailwind CSS"],
        "duration_min_weeks": 8,
        "duration_max_weeks": 16,
        "application_url": "https://example.com/apply",
        "source_url": "https://example.com/jobs/1",
        "posted_at": "2026-08-01T10:00:00Z",
        "application_deadline": "2026-09-30T23:59:59Z",
    }

    normalized = normalize_listing(raw, source_type="rss")

    check("title whitespace collapsed", normalized["title"] == "Backend Data Intern")
    check(
        "HTML stripped from description",
        normalized["description"] == "Data Intern Work with pandas & SQL.",
    )

    check("country standardized -> Ethiopia", normalized["country"] == "Ethiopia")
    check("city standardized -> Addis Ababa", normalized["city"] == "Addis Ababa")
    check(
        "location_text rebuilt",
        normalized["location_text"] == "Addis Ababa, Ethiopia",
    )

    check(
        "strip_html handles plain text",
        strip_html("Plain  text.") == "Plain text.",
    )

    check(
        "Python matched exactly",
        "Python" in normalized["required_skills"]
        and python.id in normalized["required_skill_ids"],
    )
    check(
        "Django matched exactly",
        "Django" in normalized["required_skills"]
        and django_skill.id in normalized["required_skill_ids"],
    )
    check(
        "'Java Script' fuzzy-matched to JavaScript",
        "JavaScript" in normalized["required_skills"]
        and javascript.id in normalized["required_skill_ids"],
    )

    review = normalized["skills_review"]
    fuzzy = [e for e in review if e["method"] == "fuzzy"]
    check(
        "fuzzy match is flagged low_confidence for admin review",
        len(fuzzy) == 1
        and fuzzy[0]["text"] == "Java Script"
        and fuzzy[0]["matched_skill"] == "JavaScript"
        and fuzzy[0]["score"] >= FUZZY_MATCH_THRESHOLD
        and fuzzy[0]["low_confidence"] is True,
    )

    unmatched = [e for e in review if e["method"] is None]
    check("no unexpected unmatched skills", len(unmatched) == 0)

    check(
        "preferred_skills cleaned, not looked up",
        normalized["preferred_skills"] == ["React", "Tailwind CSS"],
    )

    check(
        "output covers all Task 1.5 fields",
        set(SCHEMA_FIELDS) <= set(normalized.keys()),
    )
    check(
        "pipeline metadata present",
        set(normalized.keys()) >= {
            "required_skill_ids",
            "skills_review",
            "source_type",
        },
    )
    check(
        "source_type recorded",
        normalized["source_type"] == "rss",
    )
    check(
        "enters pipeline as unverified draft",
        normalized["status"] == "draft"
        and normalized["is_verified"] is False,
    )

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()