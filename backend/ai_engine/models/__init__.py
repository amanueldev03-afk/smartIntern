"""
Plain Python dataclasses that represent the inputs and outputs of the
AI engine. No Django ORM imports — these are framework-agnostic.

Django views/serializers convert ORM objects into these dataclasses
before handing them to ai_engine, and convert results back afterwards.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class StudentInput:
    """
    All student data the AI engine needs to generate recommendations.
    Mirrors the fields used by recommendation_engine_v2.
    """
    user_id: int
    skills: list[str]                   # lowercased skill names (profile M2M + CV extracted)
    field_of_study: str = ""
    education_level: str = ""
    bio: str = ""
    experience: str = ""
    interests: list[str] = field(default_factory=list)
    country: str = ""
    city: str = ""
    internship_type: str = "any"        # remote / onsite / hybrid / any
    work_type: str = "either"           # full_time / part_time / either
    compensation_preference: str = "either"
    minimum_compensation: Optional[float] = None
    maximum_compensation: Optional[float] = None
    preferred_locations: list[str] = field(default_factory=list)
    willing_to_relocate: bool = False
    embedding: Optional[list[float]] = None   # pre-computed 384-dim vector


@dataclass
class InternshipInput:
    """
    Internship data the AI engine scores against a student profile.
    """
    internship_id: int
    title: str
    description: str
    required_skills: list[str]          # lowercased skill names
    category: str = ""
    internship_type: str = "onsite"     # remote / onsite / hybrid
    work_type: str = "full_time"
    compensation_type: str = "unknown"  # paid / unpaid / unknown
    minimum_compensation: Optional[float] = None
    maximum_compensation: Optional[float] = None
    country: str = ""
    city: str = ""
    embedding: Optional[list[float]] = None   # pre-computed 384-dim vector


@dataclass
class ScoreBreakdown:
    """
    Individual component scores (all 0.0–1.0) before weighting.
    Mirrors the six factors from the business spec:
      skills 40%, field_of_study 20%, career_interest 15%,
      experience 10%, location 10%, work_mode 5%
    """
    skill: float = 0.0
    semantic: float = 0.0
    field_of_study: float = 0.0
    career_interest: float = 0.0
    experience: float = 0.0
    location: float = 0.0
    work_mode: float = 0.0
    salary: float = 0.0


@dataclass
class RecommendationOutput:
    """
    The AI engine's output for a single student↔internship pair.
    """
    internship_id: int
    score: float                        # final weighted score 0.0–100.0
    breakdown: ScoreBreakdown = field(default_factory=ScoreBreakdown)
    explanation: list[str] = field(default_factory=list)
    matched_skills: list[str] = field(default_factory=list)


@dataclass
class ParsedCV:
    """
    Structured output of the resume parser.

    Phase 6 Task 6.1 — Output contract includes experience_years for
    calculating total professional experience from parsed experience entries.
    """
    skills: list[str] = field(default_factory=list)
    education: list[dict] = field(default_factory=list)
    experience: list[dict] = field(default_factory=list)
    projects: list[dict] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)
    experience_years: float = 0.0
    raw_text: str = ""
