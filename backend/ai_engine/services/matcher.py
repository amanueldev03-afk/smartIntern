"""
6-Factor Hybrid Recommendation Engine & Explainable AI (XAI) Generator.
Combines deterministic scoring factors with dense 384-dimensional vector
embeddings queried via pgvector.
"""

from __future__ import annotations

import difflib
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Common Computing / Engineering fields
COMPUTING_FIELDS: Set[str] = {
    "computer science",
    "software engineering",
    "information technology",
    "information systems",
    "computer engineering",
    "data science",
    "artificial intelligence",
    "electrical and computer engineering",
    "electrical engineering",
    "cybersecurity",
    "informatics",
    "computational science",
    "network engineering",
}

# Skill synonyms and canonical forms
SKILL_SYNONYMS: Dict[str, str] = {
    "js": "javascript",
    "javascript": "javascript",
    "ts": "typescript",
    "typescript": "typescript",
    "py": "python",
    "python": "python",
    "python3": "python",
    "react": "react",
    "reactjs": "react",
    "react.js": "react",
    "vue": "vue",
    "vuejs": "vue",
    "vue.js": "vue",
    "angular": "angular",
    "angularjs": "angular",
    "node": "nodejs",
    "nodejs": "nodejs",
    "node.js": "nodejs",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "psql": "postgresql",
    "mysql": "mysql",
    "mongo": "mongodb",
    "mongodb": "mongodb",
    "k8s": "kubernetes",
    "kubernetes": "kubernetes",
    "docker": "docker",
    "containerization": "docker",
    "aws": "amazon web services",
    "amazon web services": "amazon web services",
    "gcp": "google cloud platform",
    "google cloud": "google cloud platform",
    "azure": "azure",
    "ml": "machine learning",
    "machine learning": "machine learning",
    "ai": "artificial intelligence",
    "artificial intelligence": "artificial intelligence",
    "dl": "deep learning",
    "deep learning": "deep learning",
    "nlp": "natural language processing",
    "natural language processing": "natural language processing",
    "cv": "computer vision",
    "computer vision": "computer vision",
    "html": "html",
    "html5": "html",
    "css": "css",
    "css3": "css",
    "tailwind": "tailwind css",
    "tailwindcss": "tailwind css",
    "bootstrap": "bootstrap",
    "django": "django",
    "drf": "django rest framework",
    "django rest framework": "django rest framework",
    "fastapi": "fastapi",
    "flask": "flask",
    "spring": "spring boot",
    "spring boot": "spring boot",
    "springboot": "spring boot",
    "git": "git",
    "github": "git",
    "gitlab": "git",
    "ci/cd": "cicd",
    "cicd": "cicd",
    "sql": "sql",
    "c++": "cpp",
    "cpp": "cpp",
    "c#": "csharp",
    "csharp": "csharp",
    ".net": "dotnet",
    "dotnet": "dotnet",
}


def canonicalize_skill(skill_name: str) -> str:
    """Normalize skill name and map known synonyms."""
    cleaned = skill_name.strip().lower()
    return SKILL_SYNONYMS.get(cleaned, cleaned)


def _get_student_skills(student: Any) -> Set[str]:
    """Extract list of skill names from student object or dictionary."""
    skills = set()
    # Check M2M relation (e.g. student.skills.all())
    if hasattr(student, "skills"):
        try:
            for s in student.skills.all():
                name = getattr(s, "name", str(s))
                skills.add(name.strip())
        except Exception:
            if isinstance(student.skills, (list, set, tuple)):
                for s in student.skills:
                    skills.add(str(s).strip())
    elif isinstance(student, dict) and "skills" in student:
        for s in student["skills"]:
            skills.add(str(s).strip())

    # Check extracted CV skills if available
    user = getattr(student, "user", None)
    if user:
        try:
            from apps.students.models import CV as CVModel, StudentCV
            completed_cv = (
                CVModel.objects.filter(student=user, processing_status=CVModel.STATUS_COMPLETED)
                .order_by("-created_at")
                .first()
            )
            if completed_cv and completed_cv.extracted_skills:
                for s in completed_cv.extracted_skills:
                    skills.add(str(s).strip())
            else:
                legacy = StudentCV.objects.filter(student=user).first()
                if legacy and getattr(legacy, "extracted_skills", None):
                    for s in legacy.extracted_skills:
                        skills.add(str(s).strip())
        except Exception:
            pass

    return {s for s in skills if s}


def _get_internship_skills(internship: Any) -> Set[str]:
    """Extract required skills from internship object or dictionary."""
    skills = set()
    if hasattr(internship, "required_skills"):
        try:
            for s in internship.required_skills.all():
                name = getattr(s, "name", str(s))
                skills.add(name.strip())
        except Exception:
            if isinstance(internship.required_skills, (list, set, tuple)):
                for s in internship.required_skills:
                    skills.add(str(s).strip())
    elif isinstance(internship, dict) and "required_skills" in internship:
        for s in internship["required_skills"]:
            skills.add(str(s).strip())
    return {s for s in skills if s}


def match_skills(student_skills: Set[str], required_skills: Set[str]) -> Tuple[List[str], List[str], float]:
    """
    Match student skills against required skills using exact intersection and fuzzy synonym matching.
    Returns: (matched_skills, missing_skills, skill_score_0_to_1)
    """
    if not required_skills:
        return list(student_skills), [], 1.0

    student_canon_map = {canonicalize_skill(s): s for s in student_skills}
    matched: List[str] = []
    missing: List[str] = []

    for req in required_skills:
        req_canon = canonicalize_skill(req)
        
        # 1. Exact canonical match
        if req_canon in student_canon_map:
            matched.append(req)
            continue
            
        # 2. Fuzzy match
        fuzzy_match_found = False
        for s_canon in student_canon_map.keys():
            ratio = difflib.SequenceMatcher(None, req_canon, s_canon).ratio()
            if ratio >= 0.85:
                matched.append(req)
                fuzzy_match_found = True
                break
        
        if not fuzzy_match_found:
            missing.append(req)

    score = len(matched) / len(required_skills) if required_skills else 1.0
    return matched, missing, min(1.0, max(0.0, score))


def calculate_education_score(student: Any, internship: Any) -> Tuple[float, str]:
    """
    S_education (20%):
    - 1.0 for exact major match
    - 0.7 for related computing fields
    - 0.0 otherwise
    """
    student_major = str(getattr(student, "field_of_study", "") or "").strip().lower()
    internship_title = str(getattr(internship, "title", "") or "").strip().lower()
    internship_category = str(getattr(internship, "category", "") or "").strip().lower()
    internship_desc = str(getattr(internship, "description", "") or "").strip().lower()
    target_major = str(getattr(internship, "target_major", "") or "").strip().lower()

    if not student_major:
        return 0.5, "Major relevance: Neutral / Unspecified field of study"

    # Exact major match
    if target_major and (student_major == target_major or target_major in student_major):
        return 1.0, f"Major relevance: {student_major.title()} is an exact match for target major"

    # Title / Category direct alignment
    if student_major in internship_title or student_major in internship_category:
        return 1.0, f"Major relevance: {student_major.title()} directly aligns with internship role"

    # Check computing fields
    is_student_computing = any(f in student_major for f in COMPUTING_FIELDS)
    is_internship_computing = (
        any(f in internship_title for f in COMPUTING_FIELDS)
        or any(f in internship_category for f in COMPUTING_FIELDS)
        or any(f in internship_desc for f in ["software", "developer", "programming", "code", "tech", "computer", "data", "it", "web"])
    )

    if is_student_computing and is_internship_computing:
        return 0.7, f"Major relevance: {student_major.title()} is a related computing/engineering discipline"

    return 0.0, f"Major relevance: {student_major.title()} does not directly align with this role"


def calculate_interest_score(student: Any, internship: Any) -> Tuple[float, str]:
    """
    S_interest (15%):
    Overlap between student's career interest categories and the internship domain.
    """
    student_interests = []
    if hasattr(student, "interests"):
        try:
            student_interests = [str(i.name).lower() for i in student.interests.all()]
        except Exception:
            pass
    if not student_interests and hasattr(student, "career_interests"):
        try:
            student_interests = [str(i.name).lower() for i in student.career_interests.all()]
        except Exception:
            pass
    if not student_interests and hasattr(student, "preferred_industries"):
        student_interests = [str(i).lower() for i in (student.preferred_industries or [])]

    if not student_interests:
        return 0.5, "Interest alignment: Neutral / No explicit career interests set"

    internship_context = f"{getattr(internship, 'category', '')} {getattr(internship, 'title', '')}".lower()
    
    matches = [interest for interest in student_interests if interest in internship_context]
    if matches:
        score = min(1.0, 0.5 + 0.5 * (len(matches) / len(student_interests)))
        return score, f"Interest alignment: Matches career interest in {', '.join(matches[:3])}"

    return 0.0, "Interest alignment: Outside current preferred career tracks"


def calculate_experience_score(student: Any, internship: Any) -> Tuple[float, str]:
    """
    S_experience (10%):
    Match between student's graduation cohort/study year and internship target level.
    """
    student_year = getattr(student, "current_year", None)
    internship_text = f"{getattr(internship, 'title', '')} {getattr(internship, 'description', '')}".lower()

    # Detect target cohort / level
    is_senior = any(term in internship_text for term in ["senior", "final year", "graduating", "postgraduate"])
    is_entry = any(term in internship_text for term in ["entry level", "beginner", "freshman", "sophomore", "junior", "any student"])

    if student_year is not None:
        try:
            year_int = int(student_year)
            if is_senior and year_int >= 4:
                return 1.0, f"Cohort alignment: Year {year_int} student matches senior/final-year internship"
            elif is_senior and year_int < 3:
                return 0.3, f"Cohort alignment: Senior internship may require more advanced coursework than Year {year_int}"
            elif is_entry:
                return 1.0, f"Cohort alignment: Year {year_int} student fits entry/intermediate placement"
            else:
                return 0.8, f"Cohort alignment: Year {year_int} candidate aligns with standard student criteria"
        except (ValueError, TypeError):
            pass

    return 0.8, "Cohort alignment: Suitable for undergraduate internship candidates"


def calculate_location_score(student: Any, internship: Any) -> Tuple[float, str]:
    """
    S_location (10%):
    - 1.0 for same city or Remote
    - 0.5 for out-of-town if student accepts relocation
    - 0.0 otherwise
    """
    internship_type = str(getattr(internship, "internship_type", "") or "").lower()
    work_type = str(getattr(internship, "work_type", "") or "").lower()
    internship_city = str(getattr(internship, "city", "") or "").strip().lower()
    student_city = str(getattr(student, "city", "") or "").strip().lower()
    willing_to_relocate = bool(getattr(student, "willing_to_relocate", False))

    if internship_type == "remote" or work_type == "remote" or "remote" in internship_city:
        return 1.0, "Location alignment: Remote position — fully accessible from anywhere"

    if student_city and internship_city and student_city == internship_city:
        return 1.0, f"Location alignment: Located in {internship_city.title()} (matches your city)"

    if willing_to_relocate:
        city_display = internship_city.title() if internship_city else "Company location"
        return 0.5, f"Location alignment: Located in {city_display} (matches your willingness to relocate)"

    city_display = internship_city.title() if internship_city else "Onsite location"
    return 0.0, f"Location alignment: Located in {city_display} (relocation required but preference not set)"


def calculate_work_mode_score(student: Any, internship: Any) -> Tuple[float, str]:
    """
    S_work_mode (5%):
    1.0 for exact work mode match (Remote/Hybrid/Onsite).
    """
    student_pref = str(getattr(student, "internship_type", "any") or "any").strip().lower()
    internship_mode = str(getattr(internship, "internship_type", "onsite") or "onsite").strip().lower()

    if student_pref == "any" or student_pref == internship_mode:
        return 1.0, f"Work mode match: {internship_mode.title()} matches your preference"

    if "hybrid" in (student_pref, internship_mode):
        return 0.5, f"Work mode match: Partial alignment between {student_pref.title()} and {internship_mode.title()}"

    return 0.0, f"Work mode mismatch: Requires {internship_mode.title()} while preferred mode is {student_pref.title()}"


def build_student_text_representation(student: Any) -> str:
    """Build semantic text for generating a student profile embedding."""
    parts = []
    
    skills = _get_student_skills(student)
    if skills:
        parts.append("Skills: " + ", ".join(sorted(skills)))
        
    major = getattr(student, "field_of_study", None)
    if major:
        parts.append("Field of Study: " + str(major))
        
    bio = getattr(student, "bio", None)
    if bio:
        parts.append("Biography: " + str(bio))
        
    experience = getattr(student, "experience", None)
    if experience:
        parts.append("Experience: " + str(experience))
        
    city = getattr(student, "city", None)
    country = getattr(student, "country", None)
    if city or country:
        parts.append(f"Location: {city or ''}, {country or ''}".strip(", "))

    return "\n".join(parts) if parts else "Student intern candidate seeking technology opportunities."


def build_internship_text_representation(internship: Any) -> str:
    """Build semantic text for generating an internship embedding."""
    parts = []
    title = getattr(internship, "title", None)
    if title:
        parts.append("Title: " + str(title))
        
    category = getattr(internship, "category", None)
    if category:
        parts.append("Category: " + str(category))
        
    desc = getattr(internship, "description", None)
    if desc:
        parts.append("Description: " + str(desc))
        
    skills = _get_internship_skills(internship)
    if skills:
        parts.append("Required Skills: " + ", ".join(sorted(skills)))

    return "\n".join(parts) if parts else "Internship opportunity."


def calculate_cosine_similarity(vec_a: Optional[List[float]], vec_b: Optional[List[float]]) -> float:
    """Calculate cosine similarity scaled to 0-100."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    # Dot product equals cosine similarity for L2-normalized vectors
    return round(float(max(0.0, min(100.0, dot * 100.0))), 2)


def calculate_match_score(student: Any, internship: Any) -> Dict[str, Any]:
    """
    6-Factor Weighted Scoring Engine & Explainable AI Generator.

    Weights:
      S_skill       (40%): Set intersection + fuzzy synonym matching
      S_education   (20%): 1.0 exact major match, 0.7 computing related, 0.0 other
      S_interest    (15%): Overlap between career interest categories and domain
      S_experience  (10%): Graduation cohort / level match
      S_location    (10%): 1.0 same city / remote, 0.5 relocation willing, 0.0 other
      S_work_mode    (5%): 1.0 exact work mode match

    Formula:
      S_overall = (0.40 * S_skill + 0.20 * S_education + 0.15 * S_interest +
                   0.10 * S_experience + 0.10 * S_location + 0.05 * S_work_mode) * 100

    Cosine Semantic Boost:
      Combines S_overall with pgvector cosine similarity:
      final_score = 0.70 * S_overall + 0.30 * S_semantic
    """
    from ai_engine.models.loader import get_embedding

    student_skills = _get_student_skills(student)
    required_skills = _get_internship_skills(internship)

    # 1. Skill Match
    matched_skills, missing_skills, s_skill = match_skills(student_skills, required_skills)

    # 2. Education Match
    s_education, edu_explanation = calculate_education_score(student, internship)

    # 3. Interest Match
    s_interest, interest_explanation = calculate_interest_score(student, internship)

    # 4. Experience Match
    s_experience, exp_explanation = calculate_experience_score(student, internship)

    # 5. Location Match
    s_location, loc_explanation = calculate_location_score(student, internship)

    # 6. Work Mode Match
    s_work_mode, work_mode_explanation = calculate_work_mode_score(student, internship)

    # Deterministic weighted formula
    s_overall = (
        0.40 * s_skill
        + 0.20 * s_education
        + 0.15 * s_interest
        + 0.10 * s_experience
        + 0.10 * s_location
        + 0.05 * s_work_mode
    ) * 100.0
    s_overall = round(max(0.0, min(100.0, s_overall)), 2)

    # Semantic Embedding Cosine Similarity
    student_emb = getattr(student, "embedding", None)
    if not student_emb:
        try:
            student_emb = get_embedding(build_student_text_representation(student))
            if hasattr(student, "save") and hasattr(student, "embedding"):
                student.embedding = student_emb
                student.save(update_fields=["embedding"])
        except Exception as e:
            logger.warning(f"Failed to generate student embedding: {e}")
            student_emb = None

    internship_emb = getattr(internship, "embedding", None)
    if not internship_emb:
        try:
            internship_emb = get_embedding(build_internship_text_representation(internship))
            if hasattr(internship, "save") and hasattr(internship, "embedding"):
                internship.embedding = internship_emb
                internship.save(update_fields=["embedding"])
        except Exception as e:
            logger.warning(f"Failed to generate internship embedding: {e}")
            internship_emb = None

    s_semantic = calculate_cosine_similarity(student_emb, internship_emb)

    # Hybrid Final Score: 70% 6-Factor Deterministic + 30% Dense Semantic Boost
    final_score = round(max(0.0, min(100.0, 0.70 * s_overall + 0.30 * s_semantic)), 2)

    # Explainable AI (XAI) Natural Language Bullets
    explanation_bullets: List[str] = []
    
    # Skills bullet
    if matched_skills:
        explanation_bullets.append(
            f"Matching skills: Matched {len(matched_skills)} required skill(s) ({', '.join(sorted(matched_skills)[:5])})."
        )
    else:
        explanation_bullets.append("Matching skills: No direct skill overlap identified.")

    # Missing skills bullet
    if missing_skills:
        explanation_bullets.append(
            f"Missing prerequisite skills: {', '.join(sorted(missing_skills)[:5])}."
        )
    else:
        explanation_bullets.append("Prerequisite skills: You meet all listed required skills!")

    # Location bullet
    explanation_bullets.append(loc_explanation)

    # Education relevance bullet
    explanation_bullets.append(edu_explanation)

    return {
        "overall_score": s_overall,
        "final_score": final_score,
        "semantic_score": s_semantic,
        "skill_score": round(s_skill * 100.0, 2),
        "education_score": round(s_education * 100.0, 2),
        "interest_score": round(s_interest * 100.0, 2),
        "experience_score": round(s_experience * 100.0, 2),
        "location_score": round(s_location * 100.0, 2),
        "work_mode_score": round(s_work_mode * 100.0, 2),
        "matched_skills": sorted(matched_skills),
        "missing_skills": sorted(missing_skills),
        "explanation": explanation_bullets,
    }


def get_ranked_recommendations(student: Any, top_n: int = 50) -> List[Dict[str, Any]]:
    """
    Generate ranked recommendations for a student using pgvector-accelerated queries
    and 6-factor hybrid scoring.
    """
    from apps.internships.models import Internship
    from ai_engine.models.loader import get_embedding
    from pgvector.django import CosineDistance

    # Ensure student embedding
    student_emb = getattr(student, "embedding", None)
    if not student_emb:
        student_emb = get_embedding(build_student_text_representation(student))
        if hasattr(student, "save") and hasattr(student, "embedding"):
            student.embedding = student_emb
            student.save(update_fields=["embedding"])

    # Query active candidate internships
    qs = Internship.objects.filter(status="active")
    
    # If student embedding exists, order by pgvector cosine distance <=>
    if student_emb:
        try:
            candidates = list(
                qs.annotate(distance=CosineDistance("embedding", student_emb))
                .order_by("distance")[: top_n * 3]
            )
        except Exception as e:
            logger.warning(f"pgvector query fallback: {e}")
            candidates = list(qs[: top_n * 3])
    else:
        candidates = list(qs[: top_n * 3])

    results: List[Dict[str, Any]] = []
    for internship in candidates:
        match_data = calculate_match_score(student, internship)
        results.append({
            "internship": internship,
            "internship_id": internship.id,
            "score": match_data["final_score"],
            "breakdown": match_data,
            "explanation": match_data["explanation"],
        })

    # Sort descending by final score
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:top_n]
