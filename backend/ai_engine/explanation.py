"""
explanation.py — human-readable match explanation generator.

Phase 6 Task 6.6 — Takes component scores and generates a human-readable
reason list explaining why a recommendation was made.

Uses threshold-based logic (e.g. score > 0.7 → include as positive reason)
rather than free-text generation, so explanations stay accurate and auditable.

Section 3.11.9 — Each component is thresholded to avoid claiming matches
that didn't happen.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExplanationConfig:
    """Configuration for explanation generation thresholds."""
    high_threshold: float = 0.70
    medium_threshold: float = 0.50
    low_threshold: float = 0.30


def build_explanation(
    skill_score: float,
    education_score: float,
    interest_score: float,
    experience_score: float,
    location_score: float,
    work_mode_score: float,
    matched_skills: Optional[list[str]] = None,
    field_of_study: Optional[str] = None,
    internship_title: Optional[str] = None,
    config: Optional[ExplanationConfig] = None,
) -> list[str]:
    """
    Generate explanation lines from component scores.
    
    Phase 6 Task 6.6 — Threshold-based explanation generation.
    Only includes reasons for components that meet threshold criteria.
    
    Args:
        skill_score: Skill matching score (0.0–1.0)
        education_score: Education alignment score (0.0–1.0)
        interest_score: Career interest score (0.0–1.0)
        experience_score: Experience relevance score (0.0–1.0)
        location_score: Location matching score (0.0–1.0)
        work_mode_score: Work mode matching score (0.0–1.0)
        matched_skills: List of matched skill names
        field_of_study: Student's field of study
        internship_title: Internship title
        config: ExplanationConfig with threshold values
    
    Returns:
        List of plain-English explanation strings
    """
    if config is None:
        config = ExplanationConfig()
    
    lines = []
    
    # Skill matching
    if skill_score >= config.high_threshold:
        lines.append("Strong match with required skills")
        if matched_skills:
            lines.append(f"Matched skills: {', '.join(matched_skills[:5])}")
    elif skill_score >= config.medium_threshold:
        lines.append("Partial skill match")
        if matched_skills:
            lines.append(f"Matched skills: {', '.join(matched_skills[:5])}")
    
    # Education/field of study
    if education_score >= config.high_threshold:
        if field_of_study:
            lines.append(f"{field_of_study} background matched")
        else:
            lines.append("Education background aligned")
    elif education_score >= config.medium_threshold:
        lines.append("Education partially aligned")
    
    # Career interest
    if interest_score >= config.high_threshold:
        lines.append("Career interest matched")
    elif interest_score >= config.medium_threshold:
        lines.append("Career interest partially matched")
    
    # Experience
    if experience_score >= config.high_threshold:
        lines.append("Experience level matched")
    elif experience_score >= config.medium_threshold:
        lines.append("Experience level acceptable")
    
    # Location
    if location_score >= config.high_threshold:
        lines.append("Location preference matched")
    elif location_score >= config.medium_threshold:
        lines.append("Location partially matched")
    
    # Work mode
    if work_mode_score >= config.high_threshold:
        lines.append("Work mode preference matched")
    
    # Fallback if no reasons met threshold
    if not lines:
        lines.append("Overall profile match")
    
    return lines


def _build_explanation_standalone(
    breakdown,
    matched_skills: list[str],
) -> list[str]:
    """
    Legacy fallback for compatibility with existing ScoreBreakdown model.
    Delegates to the new threshold-based implementation.
    """
    return build_explanation(
        skill_score=breakdown.skill,
        education_score=breakdown.field_of_study,
        interest_score=breakdown.career_interest,
        experience_score=breakdown.experience,
        location_score=breakdown.location,
        work_mode_score=breakdown.work_mode,
        matched_skills=matched_skills,
    )
