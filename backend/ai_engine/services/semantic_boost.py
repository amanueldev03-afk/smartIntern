"""
semantic_boost.py — pgvector-based semantic similarity boost.

Sits ON TOP OF the existing 6-factor weighted recommendation engine.
Semantic similarity is used ONLY to break ties between candidates having the same
underlying weighted score and to generate natural-language match explanations.
The semantic layer NEVER overrides, replaces, or mutates the underlying weighted score.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)


def calculate_cosine_similarity(
    vec_a: Optional[Sequence[float]],
    vec_b: Optional[Sequence[float]],
) -> float:
    """
    Calculate cosine similarity between two 384-dimensional normalized vectors.
    Returns a score scaled between 0.0 and 100.0.
    For L2-normalized vectors:
      similarity = sum(a * b)
      scaled = max(0.0, min(100.0, similarity * 100.0))
    """
    if not vec_a or not vec_b:
        return 0.0
    if len(vec_a) != len(vec_b):
        logger.warning(
            f"Vector dimension mismatch: len(vec_a)={len(vec_a)}, len(vec_b)={len(vec_b)}"
        )
        return 0.0

    try:
        dot = sum(float(a) * float(b) for a, b in zip(vec_a, vec_b))
        # Clamp to [-1.0, 1.0] in case of slight precision artifacts
        dot = max(-1.0, min(1.0, dot))
        # Map negative/zero cosine to 0.0, positive cosine scaled to 0.0-100.0
        return round(float(max(0.0, min(100.0, dot * 100.0))), 2)
    except Exception as exc:
        logger.warning(f"Error calculating vector cosine similarity: {exc}")
        return 0.0


def calculate_pgvector_cosine_distance(
    vec_a: Optional[Sequence[float]],
    vec_b: Optional[Sequence[float]],
) -> float:
    """
    Calculate cosine distance corresponding to PostgreSQL pgvector's `<=>` operator.
    cosine_distance = 1.0 - (vec_a • vec_b) / (||vec_a|| * ||vec_b||)
    For normalized vectors: 1.0 - dot_product.
    Range is [0.0, 2.0].
    """
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 1.0

    try:
        dot = sum(float(a) * float(b) for a, b in zip(vec_a, vec_b))
        dot = max(-1.0, min(1.0, dot))
        return round(float(1.0 - dot), 4)
    except Exception:
        return 1.0


def apply_semantic_tiebreaker(
    scored_items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Sort scored candidate items by:
      1. base_score descending (Primary: deterministic 6-factor weighted score)
      2. semantic_score descending (Secondary: pgvector cosine similarity tie-breaker)
      3. posting_id ascending (Tertiary: deterministic fallback)

    Strict Guardrail:
      final_score is ALWAYS equal to base_score. The semantic score is strictly
      a tie-breaker and explainability metric.
    """
    def sort_key(item: Dict[str, Any]):
        base_score = float(item.get("base_score", item.get("match_score", 0.0)))
        score_breakdown = item.get("score_breakdown", {})
        semantic_score = float(
            item.get("semantic_score", score_breakdown.get("semantic_score", 0.0))
        )
        posting_id = int(item.get("posting_id", 0))
        return (-base_score, -semantic_score, posting_id)

    return sorted(scored_items, key=sort_key)


def build_semantic_match_explanation(
    matched_skills: Sequence[str],
    missing_skills: Sequence[str],
    semantic_score: float,
    posting: Any,
    student: Any,
) -> List[str]:
    """
    Build explainable AI natural-language bullets incorporating matching skills,
    semantic affinity, and track relevance without altering any scores.
    """
    bullets: List[str] = []

    # 1. Skill Overlap
    if matched_skills:
        skill_str = ", ".join(sorted(matched_skills)[:5])
        bullets.append(
            f"Matching skills: Matched {len(matched_skills)} required skill(s) ({skill_str})."
        )
    else:
        bullets.append("Matching skills: No direct keyword overlap identified.")

    # 2. Prerequisite Skills
    if missing_skills:
        missing_str = ", ".join(sorted(missing_skills)[:4])
        bullets.append(f"Prerequisite skills to grow: {missing_str}.")
    else:
        bullets.append("Prerequisite skills: You satisfy all listed technical requirements!")

    # 3. Semantic Alignment Explanation
    if semantic_score >= 75.0:
        bullets.append(
            f"Semantic alignment: High contextual relevance between your profile and posting requirements ({semantic_score}% similarity)."
        )
    elif semantic_score >= 50.0:
        bullets.append(
            f"Semantic alignment: Moderate contextual synergy with posting scope ({semantic_score}% similarity)."
        )
    else:
        bullets.append(
            f"Semantic alignment: General alignment across related domain concepts ({semantic_score}% similarity)."
        )

    # 4. Institutional Track Alignment
    track = getattr(posting, "track", None)
    if track == "CAMPUS":
        dept = getattr(posting, "owner_department", None)
        dept_name = getattr(dept, "department_name", "University Faculty")
        bullets.append(f"Track: Campus in-house institutional placement under {dept_name}.")
    elif track == "COMPANY":
        company = getattr(posting, "owner_company", None)
        bullets.append("Track: Industry corporate internship placement.")
    elif track == "DIRECT":
        bullets.append("Track: Direct university-to-industry placement pathway.")

    return bullets
