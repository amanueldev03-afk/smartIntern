"""
services/dedupe.py — Duplicate detection for the collection pipeline
(Section 3.10.6, Task 5.7).

Dedupe strategy, applied per normalized listing before inserting an
``Internship`` row:

  1. Exact duplicate: a row whose ``content_hash`` (SHA-256 of
     title + company + application_url, computed during Task 5.6
     normalization) already exists -> skip the insert and bump
     ``last_seen_at`` on the existing row.
  2. Near duplicate: no hash match, but a previously stored row from
     the same company has a very similar title (rapidfuzz token ratio
     at/above ``DEDUPE_FUZZY_THRESHOLD``) -> do NOT insert and do NOT
     merge. Instead flag the candidate for admin review via
     ``InternshipDuplicateFlag`` so a legitimately different listing is
     never silently dropped.
  3. Otherwise -> insert the new ``Internship`` row.
"""

from dataclasses import dataclass
from typing import Optional

from django.db import transaction
from django.utils import timezone

from rapidfuzz import fuzz

from apps.internships.models import (
    Internship,
    InternshipDuplicateFlag,
)

from .normalization import compute_content_hash


DEDUPE_FUZZY_THRESHOLD = 80

# Internal -> Internship model field mapping for storage. Keys present
# in data_sources normalization that are not model fields are handled
# explicitly (skills, compensation, skills-review metadata, etc.).
MODEL_FIELDS = [
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
    "compensation_currency",
    "compensation_period",
    "minimum_compensation",
    "maximum_compensation",
    "duration_min_weeks",
    "duration_max_weeks",
    "application_url",
    "source_url",
    "external_id",
    "posted_at",
    "application_deadline",
    "content_hash",
    "is_verified",
    "status",
    "skills_review",
]


@dataclass
class StoreResult:
    """
    Outcome of ``store_listing``.

    ``action`` is one of: ``created``, ``duplicate``, ``near_duplicate``.
    """

    action: str
    internship: Optional[Internship] = None
    flag: Optional[InternshipDuplicateFlag] = None
    matched: Optional[Internship] = None
    similarity_score: Optional[float] = None


def find_exact_duplicate(content_hash, *, now=None):
    """
    Return the stored row matching ``content_hash``, bumping its
    ``last_seen_at`` so the collector knows the listing is still live.
    """
    existing = Internship.objects.filter(content_hash=content_hash).first()
    if existing is not None:
        existing.last_seen_at = now or timezone.now()
        existing.save(update_fields=["last_seen_at", "updated_at"])
    return existing


def find_near_duplicate(normalized):
    """
    Look for a previously stored row from the same company whose title
    fuzzy-matches the candidate (rapidfuzz token ratio). Returns
    ``(candidate_row, score)`` or ``(None, 0.0)``.
    """
    title = (normalized.get("title") or "").strip()
    organization_name = (normalized.get("organization_name") or "").strip()

    if not title or not organization_name:
        return None, 0.0

    candidates = (
        Internship.objects.filter(organization_name=organization_name)
        .exclude(content_hash=normalized.get("content_hash"))
    )

    best = None
    best_score = 0.0

    for candidate in candidates:
        score = fuzz.token_ratio(title, candidate.title or "")
        if score > best_score:
            best_score = score
            best = candidate

    if best is not None and best_score >= DEDUPE_FUZZY_THRESHOLD:
        return best, best_score

    return None, 0.0


def _safe_datetime(val):
    if not val:
        return None
    import datetime
    from django.utils.dateparse import parse_datetime, parse_date
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val
    if isinstance(val, (int, float)):
        try:
            return datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
        except Exception:
            return None
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        dt = parse_datetime(val)
        if dt:
            return dt
        d = parse_date(val)
        if d:
            return datetime.datetime.combine(d, datetime.time.min, tzinfo=datetime.timezone.utc)
    return None


def _build_internship(normalized, *, data_source=None, content_hash=None, now=None):
    """Instantiate an unsaved Internship from a normalized listing."""
    now = now or timezone.now()
    data = dict(normalized)

    data["content_hash"] = content_hash or normalized.get("content_hash")
    data["data_source"] = data_source
    data["last_seen_at"] = now

    kwargs = {field: data.get(field) for field in MODEL_FIELDS}
    posted = _safe_datetime(data.get("posted_at")) or now
    deadline = _safe_datetime(data.get("application_deadline"))
    if not deadline or deadline <= now:
        deadline = posted + datetime.timedelta(days=45)
        if deadline <= now:
            deadline = now + datetime.timedelta(days=30)
    kwargs["posted_at"] = posted
    kwargs["application_deadline"] = deadline
    kwargs["preferred_skills"] = data.get("preferred_skills") or []
    kwargs["skills_review"] = data.get("skills_review") or []
    kwargs["data_source"] = data_source
    kwargs["last_seen_at"] = now
    kwargs["status"] = Internship.STATUS_ACTIVE
    kwargs["is_verified"] = True
    kwargs["needs_review"] = False

    return Internship(**kwargs)


def _resolve_skill_ids(normalized):
    """Skill primary keys from the catalogue mapping in normalization."""
    skill_ids = normalized.get("required_skill_ids")
    if skill_ids:
        return list(skill_ids)

    required_skills = normalized.get("required_skills") or []
    if not required_skills:
        return []

    from apps.internships.models import Skill

    return [
        skill.id
        for skill in Skill.objects.filter(
            name__in=required_skills, is_active=True
        )
    ]


def _flag_near_duplicate(
    matched, normalized, *, similarity_score, content_hash, now=None
):
    """Create/refresh the admin-review flag for a near-duplicate.

    Also marks the *existing* (matched) internship ``needs_review=True``
    so it surfaces in the admin review queue (Phase 9 Task 9.2).
    """
    now = now or timezone.now()

    existing_flag = (
        InternshipDuplicateFlag.objects.filter(
            internship=matched,
            content_hash=normalized.get("content_hash"),
        )
        .filter(review_status=InternshipDuplicateFlag.REVIEW_PENDING)
        .first()
    )

    if existing_flag is not None:
        existing_flag.similarity_score = similarity_score
        existing_flag.last_seen_at = now
        existing_flag.save(
            update_fields=["similarity_score", "last_seen_at", "updated_at"]
        )
    else:
        existing_flag = InternshipDuplicateFlag.objects.create(
            internship=matched,
            title=normalized.get("title") or "",
            organization_name=normalized.get("organization_name") or "",
            application_url=normalized.get("application_url") or "",
            content_hash=normalized.get("content_hash") or content_hash,
            similarity_score=similarity_score,
            last_seen_at=now,
        )

    # Ensure the matched internship is surfaced in the admin review queue.
    if not matched.needs_review:
        matched.needs_review = True
        matched.save(update_fields=["needs_review", "updated_at"])

    return existing_flag


def dispatch_url_validation(internship_id):
    """
    Queue the async URL-validation task for a newly stored listing
    (Task 5.9). Runs after commit so the task never sees a row inside
    a still-open transaction.
    """
    from apps.internships.tasks import validate_listing_urls_task
    validate_listing_urls_task.delay(internship_id)


@transaction.atomic
def store_listing(normalized, *, data_source=None, now=None):
    """
    Store one normalized listing with exact + fuzzy duplicate detection.

    Returns a ``StoreResult`` describing what happened:
      - ``duplicate``: content_hash matched an existing row; its
        ``last_seen_at`` was updated, nothing was inserted.
      - ``near_duplicate``: same company + similar title; flagged for
        admin review, nothing was inserted or merged.
      - ``created``: a new Internship row was inserted.
    """
    now = now or timezone.now()

    content_hash = normalized.get("content_hash") or compute_content_hash(
        normalized.get("title") or "",
        normalized.get("organization_name") or "",
        normalized.get("application_url") or "",
    )

    existing = find_exact_duplicate(content_hash, now=now)
    if existing is not None:
        return StoreResult(action="duplicate", internship=existing)

    matched, score = find_near_duplicate(normalized)
    if matched is not None:
        flag = _flag_near_duplicate(
            matched,
            normalized,
            similarity_score=score,
            content_hash=content_hash,
            now=now,
        )
        return StoreResult(
            action="near_duplicate",
            flag=flag,
            matched=matched,
            similarity_score=score,
        )

    internship = _build_internship(
        normalized,
        data_source=data_source,
        content_hash=content_hash,
        now=now,
    )
    internship.save()

    skill_ids = _resolve_skill_ids(normalized)
    if skill_ids:
        internship.required_skills.set(skill_ids)

    transaction.on_commit(
        lambda: dispatch_url_validation(internship.pk)
    )

    return StoreResult(action="created", internship=internship)