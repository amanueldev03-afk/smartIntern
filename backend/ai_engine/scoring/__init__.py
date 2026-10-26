"""
scoring/ — individual component score functions (Sections 3.11.4–3.11.7).

Each function returns 0.0–1.0:
  - education_score: field_of_study/education_level alignment
  - experience_score: bucket comparison (beginner/intermediate/advanced)
  - interest_score: StudentInterest vs internship category overlap
  - location_score: country/city match with remote override
  - work_mode_score: exact match (Remote/Hybrid/On-site)

Phase 6 Task 6.4 — Pure functions independent of Django ORM for testability.
"""

from __future__ import annotations
from typing import Optional


# Education scoring (Section 3.11.4)
EDUCATION_SYNONYMS = {
    "cs": "computer_science",
    "comp sci": "computer_science",
    "computer science": "computer_science",
    "se": "software_engineering",
    "software eng": "software_engineering",
    "software engineering": "software_engineering",
    "it": "information_technology",
    "info tech": "information_technology",
    "information technology": "information_technology",
}

EDUCATION_LEVEL_HIERARCHY = {
    "high_school": 1,
    "diploma": 2,
    "bachelor": 3,
    "master": 4,
    "phd": 5,
}


def normalize_field_of_study(field: str) -> str:
    """Normalize field of study to canonical form using synonym map."""
    if not field:
        return ""
    normalized = field.lower().strip()
    return EDUCATION_SYNONYMS.get(normalized, normalized)


def education_score(
    student_field_of_study: str,
    student_education_level: str,
    internship_field_of_study: Optional[str] = None,
    internship_education_level: Optional[str] = None,
) -> float:
    """
    Section 3.11.4 — Education alignment score.
    
    Returns 0.0–1.0 based on:
    - Field of study match (with synonym support)
    - Education level meets or exceeds requirements
    
    Scoring:
      1.0 — Exact field match + level meets or exceeds requirement
      0.8 — Related field match (e.g., CS → Software Engineering)
      0.6 — Same broad category (e.g., STEM fields)
      0.4 — Field mismatch but level exceeds requirement
      0.0 — No match
    """
    if not student_field_of_study:
        return 0.0
    
    if not internship_field_of_study:
        # No specific requirement → neutral score based on level
        return 0.5
    
    # Normalize field names
    student_field = normalize_field_of_study(student_field_of_study)
    internship_field = normalize_field_of_study(internship_field_of_study)
    
    # Exact field match
    if student_field == internship_field:
        field_score = 1.0
    # Related fields (STEM groupings)
    elif _is_related_field(student_field, internship_field):
        field_score = 0.8
    else:
        field_score = 0.0
    
    # Check education level if specified
    if internship_education_level and student_education_level:
        student_level = EDUCATION_LEVEL_HIERARCHY.get(student_education_level.lower(), 0)
        required_level = EDUCATION_LEVEL_HIERARCHY.get(internship_education_level.lower(), 0)
        
        if student_level >= required_level:
            level_score = 1.0
        elif student_level >= required_level - 1:
            level_score = 0.7
        else:
            level_score = 0.0
    else:
        level_score = 1.0  # No level requirement
    
    # Combine field and level scores
    return (field_score * 0.7) + (level_score * 0.3)


def _is_related_field(field1: str, field2: str) -> bool:
    """Check if two fields are related (same broad category)."""
    stem_fields = {
        "computer_science", "software_engineering", "data_science",
        "artificial_intelligence", "information_technology", "information_systems",
        "computer_engineering", "electrical_engineering", "mathematics", "physics"
    }
    business_fields = {
        "business_administration", "economics", "finance", "accounting",
        "marketing", "management"
    }
    
    f1, f2 = field1.lower(), field2.lower()
    
    # Same category
    if (f1 in stem_fields and f2 in stem_fields):
        return True
    if (f1 in business_fields and f2 in business_fields):
        return True
    
    return False


# Experience scoring (Section 3.11.5)
EXPERIENCE_BUCKETS = {
    "beginner": 1,
    "entry_level": 2,
    "intermediate": 3,
    "senior": 4,
    "lead": 5,
}


def experience_score(
    student_experience_level: str,
    internship_experience_level: str,
    student_experience_years: float = 0.0,
) -> float:
    """
    Section 3.11.5 — Experience bucket comparison.
    
    Returns 0.0–1.0 based on:
    - Student experience level vs internship requirement
    - Years of experience as secondary factor
    
    Scoring:
      1.0 — Student level matches or exceeds requirement
      0.8 — Student level is one step below requirement
      0.5 — Student level is two steps below requirement
      0.2 — Student level is three+ steps below requirement
      0.0 — Complete mismatch
    """
    if not student_experience_level or not internship_experience_level:
        return 0.5
    
    student_bucket = EXPERIENCE_BUCKETS.get(student_experience_level.lower(), 2)
    internship_bucket = EXPERIENCE_BUCKETS.get(internship_experience_level.lower(), 2)
    
    diff = student_bucket - internship_bucket
    
    if diff >= 0:
        # Student meets or exceeds requirement
        base_score = 1.0
    elif diff == -1:
        base_score = 0.8
    elif diff == -2:
        base_score = 0.5
    else:
        base_score = 0.2
    
    # Boost score if student has significant experience
    if student_experience_years >= 3.0:
        base_score = min(1.0, base_score + 0.1)
    elif student_experience_years >= 1.0:
        base_score = min(1.0, base_score + 0.05)
    
    return base_score


# Career interest scoring (Section 3.11.6)
def interest_score(
    student_interests: list[str],
    internship_category: str,
    use_semantic: bool = True,
) -> float:
    """
    Section 3.11.6 — Career interest overlap score.
    
    Returns 0.0–1.0 based on:
    - Exact match between student interests and internship category
    - Semantic similarity for non-exact matches (if enabled)
    
    Scoring:
      1.0 — Exact match
      0.8 — High semantic similarity (>0.7)
      0.6 — Moderate semantic similarity (>0.5)
      0.4 — Low semantic similarity (>0.3)
      0.0 — No match
    """
    if not student_interests or not internship_category:
        return 0.0
    
    internship_cat = internship_category.lower().strip()
    
    # Check for exact match
    for interest in student_interests:
        if interest.lower().strip() == internship_cat:
            return 1.0
    
    # Use semantic similarity if enabled
    if use_semantic:
        try:
            from ai_engine.embeddings import generate_text_embedding
            from ai_engine.semantic_matching import similarity_score
            
            # Generate embeddings for all interests
            interest_texts = " ".join(student_interests)
            interest_emb = generate_text_embedding(interest_texts)
            internship_emb = generate_text_embedding(internship_category)
            
            if interest_emb and internship_emb:
                sim = similarity_score(interest_emb, internship_emb) / 100.0
                
                if sim > 0.7:
                    return 0.8
                elif sim > 0.5:
                    return 0.6
                elif sim > 0.3:
                    return 0.4
        except Exception:
            # Fallback to exact match only
            pass
    
    return 0.0


# Location scoring (Section 3.11.7)
def location_score(
    student_country: str,
    student_city: str,
    internship_country: str,
    internship_city: str,
    internship_type: str = "onsite",
    student_willing_to_relocate: bool = False,
    student_preferred_locations: Optional[list[str]] = None,
) -> float:
    """
    Section 3.11.7 — Location matching score.
    
    Returns 0.0–1.0 based on:
    - Exact city match = 1.0
    - Same country, different city = 0.5
    - Preferred location match = 0.75
    - Remote internship = 1.0 (location irrelevant)
    - Willing to relocate = 1.0
    
    Scoring:
      1.0 — Exact city match, remote, or willing to relocate
      0.75 — Preferred location match
      0.5 — Same country, different city
      0.0 — No match
    """
    if not student_country or not internship_country:
        return 0.5
    
    # Remote internship or student willing to relocate
    if internship_type.lower() == "remote" or student_willing_to_relocate:
        return 1.0
    
    # Exact city match
    if student_city and internship_city:
        if student_city.lower().strip() == internship_city.lower().strip():
            return 1.0
    
    # Preferred location match
    if student_preferred_locations:
        for pref in student_preferred_locations:
            pref_lower = pref.lower().strip()
            if pref_lower in internship_city.lower() or pref_lower in internship_country.lower():
                return 0.75
    
    # Same country, different city
    if student_country.lower().strip() == internship_country.lower().strip():
        return 0.5
    
    return 0.0


# Work mode scoring (Section 3.11.7)
def work_mode_score(
    student_work_mode: str,
    internship_work_mode: str,
) -> float:
    """
    Section 3.11.7 — Work mode matching score.
    
    Returns 0.0–1.0 based on exact match:
    - Remote/Hybrid/On-site exact match = 1.0
    - Student prefers "any" = 1.0
    - Mismatch = 0.0
    
    Scoring:
      1.0 — Exact match or student flexible
      0.0 — Mismatch
    """
    if not student_work_mode or not internship_work_mode:
        return 0.5
    
    student_mode = student_work_mode.lower().strip()
    internship_mode = internship_work_mode.lower().strip()
    
    # Student is flexible
    if student_mode in ("any", "either", ""):
        return 1.0
    
    # Exact match
    if student_mode == internship_mode:
        return 1.0
    
    return 0.0
