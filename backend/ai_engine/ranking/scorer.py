"""
scorer.py — Weighted ranking algorithm (Section 3.11.8, Table 3.1).

Phase 6 Task 6.5 — Implements the canonical weighted scoring algorithm
with configurable weights. Weights are defined as constants to allow
future semantic-model improvements without touching this function.

Table 3.1 Weights (must sum to 1.0):
  skill_score       40%  — exact + semantic skill overlap (combined)
  education_score   20%  — field_of_study/education_level alignment
  interest_score    15%  — career interest overlap
  experience_score  10%  — experience bucket comparison
  location_score    10%  — location matching
  work_mode_score    5%  — work mode matching
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


# Table 3.1 weights (Section 3.11.8) — must sum to 1.0
WEIGHTS = {
    "skill_score": 0.40,
    "education_score": 0.20,
    "interest_score": 0.15,
    "experience_score": 0.10,
    "location_score": 0.10,
    "work_mode_score": 0.05,
}


@dataclass
class ComponentScores:
    """Container for individual component scores (0.0–1.0 each)."""
    skill_score: float = 0.0
    education_score: float = 0.0
    interest_score: float = 0.0
    experience_score: float = 0.0
    location_score: float = 0.0
    work_mode_score: float = 0.0


def calculate_overall_score(scores: ComponentScores) -> float:
    """
    Calculate the overall recommendation score using Table 3.1 weights.
    
    Formula (Section 3.11.8):
      overall = 0.40*skill_score + 0.20*education_score + 0.15*interest_score
                + 0.10*experience_score + 0.10*location_score + 0.05*work_mode_score
    
    Args:
        scores: ComponentScores object with individual component scores (0.0–1.0)
    
    Returns:
        Overall score in range 0.0–100.0
    """
    raw = (
        scores.skill_score * WEIGHTS["skill_score"]
        + scores.education_score * WEIGHTS["education_score"]
        + scores.interest_score * WEIGHTS["interest_score"]
        + scores.experience_score * WEIGHTS["experience_score"]
        + scores.location_score * WEIGHTS["location_score"]
        + scores.work_mode_score * WEIGHTS["work_mode_score"]
    )
    
    # Scale to 0–100 and round to 2 decimal places
    return round(min(100.0, max(0.0, raw * 100)), 2)


def validate_weights() -> bool:
    """
    Validate that weights sum to 1.0 (within floating-point tolerance).
    
    Returns:
        True if weights sum to approximately 1.0, False otherwise
    """
    total = sum(WEIGHTS.values())
    return abs(total - 1.0) < 0.0001


def get_weights() -> dict:
    """
    Return a copy of the weights dictionary.
    
    Returns:
        Dictionary mapping component names to their weights
    """
    return WEIGHTS.copy()
