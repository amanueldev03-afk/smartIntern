"""
ranking/ — weighted score aggregation and result sorting.

Business spec weights (must sum to 1.0):
  skills          40%   — exact (25%) + semantic (15%) skill overlap
  field_of_study  20%   — education/field relevance
  career_interest 15%   — career goals match
  experience      10%   — past experience relevance
  location         8%   — location preference
  work_mode        4%   — remote/onsite/hybrid preference
  salary           3%   — compensation alignment

Note: the current recommendation_engine_v2 uses a slightly different
weight distribution. This module exposes the spec weights as the
canonical definition — the engine will be aligned here progressively.
"""

from __future__ import annotations
from ai_engine.models import ScoreBreakdown, RecommendationOutput

# Canonical weights per business spec (must sum to 1.0)
WEIGHTS = {
    "skill":           0.25,
    "semantic":        0.15,
    "field_of_study":  0.20,
    "career_interest": 0.15,
    "experience":      0.10,
    "location":        0.08,
    "work_mode":       0.04,
    "salary":          0.03,
}


def weighted_score(breakdown: ScoreBreakdown) -> float:
    """
    Combine component scores (0.0–1.0 each) into a final 0.0–100.0 score
    using the canonical business spec weights.
    """
    raw = (
        breakdown.skill * WEIGHTS["skill"]
        + breakdown.semantic * WEIGHTS["semantic"]
        + breakdown.field_of_study * WEIGHTS["field_of_study"]
        + breakdown.career_interest * WEIGHTS["career_interest"]
        + breakdown.experience * WEIGHTS["experience"]
        + breakdown.location * WEIGHTS["location"]
        + breakdown.work_mode * WEIGHTS["work_mode"]
        + breakdown.salary * WEIGHTS["salary"]
    )
    return round(min(100.0, max(0.0, raw * 100)), 2)


def rank(results: list[RecommendationOutput]) -> list[RecommendationOutput]:
    """Sort recommendation results highest score first."""
    return sorted(results, key=lambda r: r.score, reverse=True)


def apply_minimum_threshold(
    results: list[RecommendationOutput],
    min_score: float = 0.0,
) -> list[RecommendationOutput]:
    """Filter out results below a minimum score threshold."""
    return [r for r in results if r.score >= min_score]
