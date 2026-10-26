"""
matcher.py — Match InternshipPosting to UIL Student.

Calls the existing canonical 6-factor weighted recommendation engine (Skills 40%,
Education 20%, Interest 15%, Experience 10%, Location 10%, Work Mode 5%) to obtain
the base score.

Applies pgvector cosine similarity (<=>) strictly to break ties and power natural
language match explanations. The base weighted score is never overridden.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

from django.db import connection
from pgvector.django import CosineDistance

from ai_engine.ranking.scorer import ComponentScores, calculate_overall_score
from ai_engine.services.matcher import (
    match_skills,
    calculate_education_score,
    calculate_interest_score,
    calculate_experience_score,
    calculate_location_score,
    calculate_work_mode_score,
    _get_student_skills,
)
from ai_engine.services.semantic_boost import (
    calculate_cosine_similarity,
    apply_semantic_tiebreaker,
    build_semantic_match_explanation,
)

logger = logging.getLogger(__name__)


class StudentPostingAdapter:
    """
    Adapter that normalizes student data across UILStudentProfile, Student,
    and StudentProfile so the existing 6-factor engine can process it seamlessly.
    """

    def __init__(self, student_obj: Any):
        self._raw = student_obj
        self.user = getattr(student_obj, "user", student_obj)
        self.skills = getattr(student_obj, "skills", None)

        # Resolve linked UIL and baseline student profiles
        self.uil_profile = None
        self.baseline_student = None

        if hasattr(student_obj, "student_id_number"):
            # student_obj is already a UILStudentProfile
            self.uil_profile = student_obj
            self.baseline_student = getattr(student_obj, "student", None)
        else:
            # Check for linked UIL profile
            if hasattr(student_obj, "uil_student_profile"):
                self.uil_profile = student_obj.uil_student_profile
            elif hasattr(student_obj, "student") and hasattr(student_obj.student, "uil_student_profile"):
                self.uil_profile = student_obj.student.uil_student_profile
            elif hasattr(student_obj, "uil_profile"):
                self.uil_profile = student_obj.uil_profile

            # Check for baseline student
            if hasattr(student_obj, "student"):
                self.baseline_student = student_obj.student
            elif hasattr(student_obj, "profile"):
                self.baseline_student = student_obj.profile
            else:
                self.baseline_student = student_obj

        # Extract normalized attributes
        self.field_of_study = (
            getattr(self.uil_profile, "department", None)
            or getattr(self.baseline_student, "field_of_study", "")
            or ""
        )
        self.current_year = (
            getattr(self.uil_profile, "academic_year", None)
            or getattr(self.baseline_student, "current_year", None)
            or 3
        )
        self.city = (
            getattr(self.uil_profile, "campus_city", None)
            or getattr(self.baseline_student, "preferred_city", None)
            or getattr(self.baseline_student, "city", "")
            or ""
        )
        self.internship_type = (
            getattr(self.baseline_student, "work_mode", None)
            or getattr(self.baseline_student, "internship_type", "any")
            or "any"
        )
        self.interests = (
            getattr(self.baseline_student, "interests", None)
            or getattr(self.baseline_student, "career_interests", None)
        )
        self.embedding = (
            getattr(self.uil_profile, "embedding", None)
            or getattr(self.baseline_student, "embedding", None)
        )

        # Ensure skills are accessible
        if not self.skills and self.baseline_student:
            self.skills = getattr(self.baseline_student, "skills", None)


def match_posting_to_student(
    student: Any,
    posting: Any,
) -> Dict[str, Any]:
    """
    Match an InternshipPosting to a Student candidate.

    Step a: Calls the existing 6-factor weighted scorer:
            overall = 0.40*skill + 0.20*edu + 0.15*interest + 0.10*exp + 0.10*loc + 0.05*work_mode
    Step b: Computes cosine similarity between student.embedding and posting.embedding
            using pgvector's cosine distance (<=>).
    Step c: final_score = existing_weighted_score (semantic similarity is used ONLY
            to break ties and generate explainable AI bullets).
    """
    adapter = StudentPostingAdapter(student)

    # 1. Skill Match (40%)
    student_skills = _get_student_skills(adapter)
    required_skills = {s.name for s in posting.required_skills.all()} if hasattr(posting, "required_skills") else set()
    matched_skills, missing_skills, s_skill = match_skills(student_skills, required_skills)

    # 2. Education Match (20%)
    s_education, _ = calculate_education_score(adapter, posting)

    # 3. Interest Match (15%)
    s_interest, _ = calculate_interest_score(adapter, posting)

    # 4. Experience / Cohort Match (10%)
    s_experience, _ = calculate_experience_score(adapter, posting)

    # 5. Location Match (10%)
    s_location, _ = calculate_location_score(adapter, posting)

    # 6. Work Mode Match (5%)
    s_work_mode, _ = calculate_work_mode_score(adapter, posting)

    # Call canonical 6-factor overall score function
    scores = ComponentScores(
        skill_score=s_skill,
        education_score=s_education,
        interest_score=s_interest,
        experience_score=s_experience,
        location_score=s_location,
        work_mode_score=s_work_mode,
    )
    base_weighted_score = calculate_overall_score(scores)

    # Step b: Compute cosine similarity between student and posting vectors
    student_emb = adapter.embedding
    posting_emb = getattr(posting, "embedding", None)

    # Compute similarity using pgvector distance / cosine dot product
    semantic_score = 0.0
    if student_emb and posting_emb:
        semantic_score = calculate_cosine_similarity(student_emb, posting_emb)

    # Step c: Strict guardrail — final_score is IDENTICAL to base_weighted_score
    final_score = base_weighted_score

    # Score breakdown details
    score_breakdown = {
        "skill_score": round(s_skill * 100.0, 2),
        "education_score": round(s_education * 100.0, 2),
        "interest_score": round(s_interest * 100.0, 2),
        "experience_score": round(s_experience * 100.0, 2),
        "location_score": round(s_location * 100.0, 2),
        "work_mode_score": round(s_work_mode * 100.0, 2),
        "semantic_score": semantic_score,
        "weights": {
            "skill_score": 0.40,
            "education_score": 0.20,
            "interest_score": 0.15,
            "experience_score": 0.10,
            "location_score": 0.10,
            "work_mode_score": 0.05,
        },
    }

    # Generate natural language explanation
    explanation = build_semantic_match_explanation(
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        semantic_score=semantic_score,
        posting=posting,
        student=adapter,
    )

    return {
        "posting": posting,
        "posting_id": posting.id,
        "track": posting.track,
        "match_score": final_score,
        "base_score": base_weighted_score,
        "semantic_score": semantic_score,
        "score_breakdown": score_breakdown,
        "explanation": explanation,
        "matched_skills": sorted(matched_skills),
        "missing_skills": sorted(missing_skills),
    }


def get_posting_recommendations_for_student(
    student_user: Any,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Query active InternshipPostings, score each against the student candidate,
    and rank using the semantic tiebreaker.
    """
    from apps.postings.models import InternshipPosting

    adapter = StudentPostingAdapter(student_user)
    postings_qs = (
        InternshipPosting.objects
        .filter(is_active=True)
        .prefetch_related("required_skills")
        .select_related("owner_department", "owner_company")
    )

    # Use pgvector distance annotation when student embedding exists
    if adapter.embedding:
        postings_qs = postings_qs.annotate(
            pgvector_distance=CosineDistance("embedding", adapter.embedding)
        )

    scored_results: List[Dict[str, Any]] = []
    for posting in postings_qs:
        match_data = match_posting_to_student(adapter, posting)
        scored_results.append(match_data)

    # Sort candidates: base_score DESC -> semantic_score DESC -> posting_id ASC
    ranked = apply_semantic_tiebreaker(scored_results)
    return ranked[:limit]
