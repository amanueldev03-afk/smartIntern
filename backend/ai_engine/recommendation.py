"""
recommendation.py — top-level AI engine orchestrator.

Entry point for the full matching pipeline:
  profile (StudentInput) + pool (list[InternshipInput])
  → ranked list[RecommendationOutput]

Phase 6 Task 6.7 — Django-integrated orchestration entrypoint:
  generate_recommendations(student) → list[RecommendationResult]
  - Loads student profile + skills + interests
  - Queries Internship.objects.filter(status='active')
  - Scores each using Tasks 6.4-6.6 functions
  - Sorts descending by overall_score
  - Returns top N (paginate/limit, e.g., top 50)
  - Persists to Recommendation model using update_or_create

Business flow (step 3):
  For each internship:
    1. Hard filter  — skip inactive, wrong type, wrong compensation
    2. Skill score  — exact name intersection (40%)
    3. Semantic score — embedding cosine similarity (part of overall)
    4. Field/interest/experience scores — profile alignment
    5. Location + work_mode scores
    6. Weighted sum → final score 0–100
    7. Generate explanation
  Sort highest → lowest, return ranked results.

For production use, the Django views call
  apps.recommendations.services.recommendation_engine_v2.generate_recommendations()
directly (which does DB reads/writes). This module provides the same
logic as a pure-Python function for testing and standalone use.
"""

from __future__ import annotations
from typing import Optional
from dataclasses import dataclass

from ai_engine.models import (
    StudentInput,
    InternshipInput,
    ScoreBreakdown,
    RecommendationOutput,
)
from ai_engine.skill_matching import exact_skill_score, get_matched_skills, blended_skill_score
from ai_engine.semantic_matching import student_internship_similarity
from ai_engine.ranking import weighted_score, rank
from ai_engine.ranking.scorer import ComponentScores, calculate_overall_score
from ai_engine.explanation import build_explanation
from ai_engine.scoring import (
    education_score,
    experience_score,
    interest_score,
    location_score,
    work_mode_score,
)


@dataclass
class RecommendationResult:
    """Result from Django-integrated recommendation generation."""
    internship: object
    score: float
    explanation: list[str]
    score_breakdown: dict


def generate_recommendations(
    student,
    limit: int = 50,
    save_to_db: bool = True,
) -> list[RecommendationResult]:
    """
    Phase 6 Task 6.7 — Django-integrated orchestration entrypoint.

    Loads student profile + skills + interests, queries active internships,
    scores each using Tasks 6.4-6.6 functions, sorts descending by overall_score,
    returns top N, and persists to Recommendation model.

    Args:
        student: Django User object
        limit: Maximum number of results to return (default 50)
        save_to_db: Whether to persist results to Recommendation model

    Returns:
        List of RecommendationResult objects sorted by score descending
    """
    from apps.students.models import StudentProfile
    from apps.internships.models import Internship
    from apps.recommendations.models import Recommendation

    # Load student profile with related data
    try:
        from apps.students.models import Student
        student_record = (
            Student.objects
            .prefetch_related("skills")
            .prefetch_related("interests")
            .select_related("user")
            .get(user=student)
        )
    except Student.DoesNotExist:
        return []

    # Query active internships
    internships = Internship.objects.filter(status="active")

    # Extract student data
    student_skills = list(student_record.skills.values_list("name", flat=True))
    student_interests = list(
        student_record.interests.values_list("name", flat=True))

    # Get student CV text for semantic matching
    student_text = _build_student_text(student_record)

    results = []

    for internship in internships:
        # Hard filter check
        if not _passes_hard_filters(internship, student_record):
            continue

        # Calculate component scores using Task 6.4 functions
        skill = blended_skill_score(
            student_skills,
            list(internship.required_skills.values_list("name", flat=True)),
            student_text,
            internship.description,
            exact_weight=0.6,
            semantic_weight=0.4
        )

        edu = education_score(
            student_record.field_of_study or "",
            student_record.education_level or "",
            internship.category,
            None  # internship education level not specified
        )

        interest = interest_score(
            student_interests,
            internship.category,
            use_semantic=True
        )

        exp = experience_score(
            "intermediate",  # Default student level
            "intermediate",  # Default internship requirement
            getattr(student_record, "extracted_experience_years", 0.0) or 0.0
        )

        loc = location_score(
            getattr(student_record, "country", "") or "",
            getattr(student_record, "city", "") or "",
            internship.country or "",
            internship.city or "",
            internship.internship_type or "onsite",
            getattr(student_record, "willing_to_relocate", False) or False,
            list(getattr(student_record, "preferred_locations", []) or [])
        )

        work = work_mode_score(
            getattr(student_record, "work_mode", "either") or "either",
            internship.work_type or "onsite"
        )

        # Calculate overall score using Task 6.5 weighted scoring
        component_scores = ComponentScores(
            skill_score=skill,
            education_score=edu,
            interest_score=interest,
            experience_score=exp,
            location_score=loc,
            work_mode_score=work,
        )

        overall_score = calculate_overall_score(component_scores)

        # Generate explanation using Task 6.6
        matched = get_matched_skills(
            student_skills,
            list(internship.required_skills.values_list("name", flat=True))
        )

        explanation = build_explanation(
            skill_score=skill,
            education_score=edu,
            interest_score=interest,
            experience_score=exp,
            location_score=loc,
            work_mode_score=work,
            matched_skills=matched,
            field_of_study=student_record.field_of_study,
            internship_title=internship.title
        )

        # Build score breakdown
        score_breakdown = {
            "skill_score": round(skill * 100, 2),
            "education_score": round(edu * 100, 2),
            "interest_score": round(interest * 100, 2),
            "experience_score": round(exp * 100, 2),
            "location_score": round(loc * 100, 2),
            "work_mode_score": round(work * 100, 2),
            "overall_score": overall_score,
        }

        results.append(RecommendationResult(
            internship=internship,
            score=overall_score,
            explanation=explanation,
            score_breakdown=score_breakdown,
        ))

        # Persist to Recommendation model if requested
        if save_to_db:
            recommendation, created = Recommendation.objects.update_or_create(
                student=student,
                internship=internship,
                defaults={
                    "overall_score": overall_score,
                    "skill_score": round(skill * 100, 2),
                    "education_score": round(edu * 100, 2),
                    "interest_score": round(interest * 100, 2),
                    "experience_score": round(exp * 100, 2),
                    "location_score": round(loc * 100, 2),
                    "work_mode_score": round(work * 100, 2),
                }
            )
            from django.conf import settings
            if created and overall_score >= settings.NOTIFICATION_HIGH_SCORE_THRESHOLD:
                from django.db import transaction
                from apps.notifications.tasks import send_high_score_recommendation_notification
                transaction.on_commit(
                    lambda recommendation_id=recommendation.id: send_high_score_recommendation_notification.delay(
                        recommendation_id
                    )
                )

    # Sort descending by overall_score
    results.sort(key=lambda r: r.score, reverse=True)

    # Apply limit
    return results[:limit]


def _build_student_text(student) -> str:
    """Build text representation of student for semantic matching."""
    parts = []

    if student.skills.exists():
        skills = list(student.skills.values_list("name", flat=True))
        parts.append("Skills: " + ", ".join(skills))

    if student.field_of_study:
        parts.append("Field of Study: " + student.field_of_study)

    return "\n".join(parts)


def _passes_hard_filters(internship, student) -> bool:
    """Check if internship passes hard filters."""
    # Skip inactive internships
    if internship.status != "active":
        return False

    # Internship type filter - skip if student has preference and it doesn't match
    pref_type = getattr(student, "internship_type", None) or "either"
    if pref_type != "either" and pref_type != "any":
        intern_type = getattr(internship, "internship_type", None) or "onsite"
        if intern_type != pref_type:
            return False

    # Compensation filter - skip if student has preference and it doesn't match
    comp_pref = getattr(student, "compensation_preference", None) or "either"
    if comp_pref != "either":
        comp_type = getattr(internship, "compensation_type", None) or "unknown"
        if comp_pref == "paid" and comp_type == "unpaid":
            return False
        if comp_pref == "unpaid" and comp_type == "paid":
            return False

    return True


def score_single(
    student: StudentInput,
    internship: InternshipInput,
) -> RecommendationOutput:
    """
    Score one student↔internship pair.
    Returns a RecommendationOutput with the full weighted score.
    """
    # --- Skill score (40%) ---
    skill = exact_skill_score(student.skills, internship.required_skills)
    matched = get_matched_skills(student.skills, internship.required_skills)

    # --- Semantic score ---
    semantic = student_internship_similarity(
        student.embedding,
        internship.embedding,
    ) / 100.0   # normalise to 0–1

    # --- Field of study (20%) ---
    field_of_study = _field_of_study_score(student, internship)

    # --- Career interest (15%) ---
    career_interest = _career_interest_score(student, internship)

    # --- Experience (10%) ---
    experience = _experience_score(student, internship)

    # --- Location (10%) ---
    location = _location_score(student, internship)

    # --- Work mode (5%) ---
    work_mode = _work_mode_score(student, internship)

    # --- Salary (part of preference) ---
    salary = _salary_score(student, internship)

    breakdown = ScoreBreakdown(
        skill=skill,
        semantic=semantic,
        field_of_study=field_of_study,
        career_interest=career_interest,
        experience=experience,
        location=location,
        work_mode=work_mode,
        salary=salary,
    )

    final_score = weighted_score(breakdown)
    explanation = build_explanation(breakdown, matched, internship.title)

    return RecommendationOutput(
        internship_id=internship.internship_id,
        score=final_score,
        breakdown=breakdown,
        explanation=explanation,
        matched_skills=matched,
    )


def recommend(
    student: StudentInput,
    internships: list[InternshipInput],
) -> list[RecommendationOutput]:
    """
    Score all internships against the student profile and return
    ranked results (highest score first).
    """
    results = [score_single(student, i) for i in internships]
    return rank(results)


def stub_score() -> dict:
    """
    Throwaway stub — returns the minimal output shape.
    Used by the verification script (Task 0.5 check).
    """
    return {"score": 0}


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _location_score(student: StudentInput, internship: InternshipInput) -> float:
    """Location match — 0.0–1.0."""
    s_country = (student.country or "").lower().strip()
    s_city = (student.city or "").lower().strip()
    i_country = (internship.country or "").lower().strip()
    i_city = (internship.city or "").lower().strip()
    i_type = (internship.internship_type or "").lower()

    pref_locs = [loc.lower().strip()
                 for loc in student.preferred_locations if loc]

    if s_city and i_city and s_city == i_city:
        return 1.0
    if i_type == "remote" or student.willing_to_relocate:
        return 1.0
    for loc in pref_locs:
        if loc and (loc in i_city or loc in i_country):
            return 0.75
    if s_country and i_country and s_country == i_country:
        return 0.5
    return 0.0


def _work_mode_score(student: StudentInput, internship: InternshipInput) -> float:
    """Work mode match — 0.0 or 1.0."""
    pref = (student.work_type or "either").lower()
    actual = (internship.work_type or "").lower()
    if pref in ("either", ""):
        return 1.0
    return 1.0 if actual == pref else 0.0


def _field_of_study_score(student: StudentInput, internship: InternshipInput) -> float:
    """
    Field-of-study relevance — 0.0–1.0.
    Compares the student's field of study against the internship category
    and description using keyword overlap.
    """
    s_field = (student.field_of_study or "").lower().strip()
    if not s_field:
        return 0.5  # neutral — no data to compare

    i_category = (internship.category or "").lower().strip()
    i_desc = (internship.description or "").lower().strip()

    # Tokenise the student's field into meaningful keywords
    field_tokens = {
        t for t in s_field.replace(",", " ").split()
        if len(t) > 2 and t not in _STOPWORDS
    }
    if not field_tokens:
        return 0.5

    # Check category first (strongest signal)
    if i_category:
        cat_tokens = {
            t for t in i_category.replace(",", " ").split()
            if len(t) > 2 and t not in _STOPWORDS
        }
        if field_tokens & cat_tokens:
            return 1.0

    # Fall back to description keyword overlap
    if i_desc:
        desc_tokens = {
            t for t in i_desc.replace(",", " ").split()
            if len(t) > 2 and t not in _STOPWORDS
        }
        overlap = field_tokens & desc_tokens
        if overlap:
            return round(min(1.0, len(overlap) / len(field_tokens) + 0.3), 2)

    return 0.0


def _career_interest_score(student: StudentInput, internship: InternshipInput) -> float:
    """
    Career-interest match — 0.0–1.0.
    Compares the student's stated interests against the internship
    category and title keywords.
    """
    interests = [i.lower().strip() for i in student.interests if i]
    if not interests:
        return 0.5  # neutral — no data

    i_category = (internship.category or "").lower().strip()
    i_title = (internship.title or "").lower().strip()
    i_desc = (internship.description or "").lower().strip()

    haystack = f"{i_category} {i_title} {i_desc}"

    for interest in interests:
        if interest and interest in haystack:
            return 1.0

    # Token-level partial match
    interest_tokens = {
        t for interest in interests
        for t in interest.replace(",", " ").split()
        if len(t) > 2 and t not in _STOPWORDS
    }
    if not interest_tokens:
        return 0.0

    haystack_tokens = {
        t for t in haystack.replace(",", " ").split()
        if len(t) > 2 and t not in _STOPWORDS
    }
    overlap = interest_tokens & haystack_tokens
    if overlap:
        return round(min(1.0, len(overlap) / len(interest_tokens) + 0.2), 2)

    return 0.0


def _experience_score(student: StudentInput, internship: InternshipInput) -> float:
    """
    Experience relevance — 0.0–1.0.
    Compares the student's experience text against the internship
    description and required skills.
    """
    s_exp = (student.experience or "").lower().strip()
    if not s_exp:
        return 0.5  # neutral — no data

    i_desc = (internship.description or "").lower().strip()
    i_skills = " ".join(internship.required_skills).lower()

    haystack = f"{i_desc} {i_skills}"

    exp_tokens = {
        t for t in s_exp.replace(",", " ").split()
        if len(t) > 2 and t not in _STOPWORDS
    }
    if not exp_tokens:
        return 0.5

    haystack_tokens = {
        t for t in haystack.replace(",", " ").split()
        if len(t) > 2 and t not in _STOPWORDS
    }
    overlap = exp_tokens & haystack_tokens
    if overlap:
        return round(min(1.0, len(overlap) / len(exp_tokens) + 0.2), 2)

    return 0.0


def _salary_score(student: StudentInput, internship: InternshipInput) -> float:
    """
    Salary/compensation match — 0.0–1.0.
    """
    comp_pref = (student.compensation_preference or "either").lower()
    i_comp_type = (internship.compensation_type or "unknown").lower()

    if comp_pref == "either":
        return 1.0

    if comp_pref == "paid":
        if i_comp_type != "paid":
            return 0.0
        # Both want paid — check range overlap
        s_min = student.minimum_compensation
        s_max = student.maximum_compensation
        i_min = internship.minimum_compensation
        i_max = internship.maximum_compensation
        # No range info → assume match
        if s_min is None:
            return 1.0
        if i_max is not None and float(i_max) >= float(s_min):
            return 1.0
        if s_max is not None and i_min is not None and float(i_min) > float(s_max):
            return 0.0
        return 0.5

    if comp_pref == "unpaid":
        return 1.0 if i_comp_type == "unpaid" else 0.5

    return 0.5


_STOPWORDS = {
    "the", "and", "for", "with", "from", "your", "you", "are", "our",
    "this", "that", "have", "will", "work", "role", "team", "able",
    "experience", "internship", "student", "students", "company",
    "position", "opportunity", "looking", "join", "who", "what",
    "when", "where", "how", "all", "any", "can", "should", "would",
    "could", "may", "might", "must", "need", "needs", "required",
    "requirements", "qualifications", "responsibilities", "including",
    "include", "etc", "e.g", "i.e", "per", "via", "using", "use",
    "based", "related", "relevant", "strong", "good", "great",
    "excellent", "knowledge", "skills", "skill", "ability", "able",
}
