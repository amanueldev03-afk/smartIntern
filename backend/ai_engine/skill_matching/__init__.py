"""
skill_matching/ — exact and fuzzy skill intersection scoring.

Business spec weight: skills = 40% of final score.

Two layers:
  1. Exact match  — lowercased string intersection (fast, no ML)
  2. Semantic match — embedding similarity for skills that don't
     share exact names but are related (e.g. "React" vs "ReactJS")

Delegates to apps.recommendations.services.recommendation_engine_v2
for the core name-based scoring already implemented there.

Phase 6 Task 6.3 — Added blended skill score combining exact-match
and semantic similarity with configurable weights (default 60/40).
"""

from __future__ import annotations
from typing import Optional


def exact_skill_score(
    student_skills: list[str],
    internship_skills: list[str],
) -> float:
    """
    Name-based intersection score.
    Returns 0.0–1.0. If no required skills → neutral 0.5.
    Delegates to the existing engine implementation.
    """
    try:
        from apps.recommendations.services.recommendation_engine_v2 import (
            calculate_skill_score,
        )
        return calculate_skill_score(student_skills, internship_skills)
    except ImportError:
        return _exact_skill_score_standalone(student_skills, internship_skills)


def _exact_skill_score_standalone(
    student_skills: list[str],
    internship_skills: list[str],
) -> float:
    """Fallback — no Django required."""
    s = {sk.lower().strip() for sk in student_skills if sk}
    i = {sk.lower().strip() for sk in internship_skills if sk}
    if not i:
        return 0.5
    return len(s & i) / len(i)


def get_matched_skills(
    student_skills: list[str],
    internship_skills: list[str],
) -> list[str]:
    """Return the list of skill names that match (preserving original case)."""
    try:
        from apps.recommendations.services.recommendation_engine_v2 import (
            get_matched_skills as _get,
        )
        return _get(student_skills, internship_skills)
    except ImportError:
        s_map = {sk.lower().strip(): sk for sk in student_skills if sk}
        i_map = {sk.lower().strip(): sk for sk in internship_skills if sk}
        return [s_map[k] for k in sorted(s_map.keys() & i_map.keys())]


def normalize_skill(skill: str) -> str:
    """Apply alias normalization to a single skill name."""
    try:
        from apps.students.services.skill_normalization import (
            normalize_skills,
        )
        result = normalize_skills([skill])
        return result[0] if result else skill
    except ImportError:
        return skill.strip()


def blended_skill_score(
    student_skills: list[str],
    internship_skills: list[str],
    student_text: Optional[str] = None,
    internship_description: Optional[str] = None,
    exact_weight: float = 0.6,
    semantic_weight: float = 0.4,
) -> float:
    """
    Phase 6 Task 6.3 — Blended skill score combining exact-match and semantic similarity.
    
    Args:
        student_skills: List of student's skill names
        internship_skills: List of internship's required skill names
        student_text: Optional student profile text for semantic matching
        internship_description: Optional internship description for semantic matching
        exact_weight: Weight for exact-match score (default 0.6)
        semantic_weight: Weight for semantic similarity (default 0.4)
    
    Returns:
        Blended score 0.0–1.0 combining exact-match ratio and semantic similarity.
        If semantic inputs are missing, falls back to exact-match only.
    """
    # Calculate exact-match score
    exact = exact_skill_score(student_skills, internship_skills)
    
    # If semantic inputs are missing, return exact score only
    if not student_text or not internship_description:
        return exact
    
    # Calculate semantic similarity
    try:
        from ai_engine.embeddings import generate_text_embedding
        from ai_engine.semantic_matching import similarity_score
        
        student_embedding = generate_text_embedding(student_text)
        internship_embedding = generate_text_embedding(internship_description)
        
        if not student_embedding or not internship_embedding:
            return exact
        
        semantic = similarity_score(student_embedding, internship_embedding) / 100.0  # Scale 0-100 to 0-1
    except Exception:
        # If semantic calculation fails, fall back to exact score
        return exact
    
    # Blend the scores
    blended = (exact * exact_weight) + (semantic * semantic_weight)
    return max(0.0, min(1.0, blended))
