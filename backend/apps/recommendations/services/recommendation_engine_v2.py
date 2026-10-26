import logging
from dataclasses import dataclass, field

from .semantic_matching import (
    calculate_semantic_similarity,
    update_student_embedding,
    update_internship_embedding,
)

logger = logging.getLogger(__name__)


@dataclass
class RecommendationResult:
    internship: object
    score: float                        # 0.0 – 100.0 final weighted score
    explanation: list[str]
    score_breakdown: dict = field(default_factory=dict)


# --------------------------------------------------
# Weights  (must sum to 1.0)
# --------------------------------------------------
SEMANTIC_WEIGHT = 0.40
SKILL_WEIGHT = 0.25
PREFERENCE_WEIGHT = 0.20
LOCATION_WEIGHT = 0.10
SALARY_WEIGHT = 0.05


# --------------------------------------------------
# Individual score functions  (all return 0.0 – 1.0)
# --------------------------------------------------

def calculate_skill_score(student_skills, internship_skills, internship_obj=None):
    """
    Name-based intersection + title/category keywords.
    Returns 0.0–1.0.
    """
    student = {s.lower().strip() for s in student_skills if s}
    if not student:
        return 0.1

    internship = {s.lower().strip() for s in internship_skills if s}
    matched = set(student & internship)

    if internship_obj is not None:
        title_cat = f"{getattr(internship_obj, 'title', '')} {getattr(internship_obj, 'category', '')}".lower()
        for s in student:
            if s and len(s) >= 2 and s in title_cat:
                matched.add(s)

    if not internship:
        return min(1.0, 0.2 + (len(matched) * 0.3)) if matched else 0.1

    score = len(matched) / len(internship)
    return min(1.0, max(0.0, score))


def get_matched_skills(student_skills, internship_skills, internship_obj=None):
    s_map = {s.lower().strip(): s for s in student_skills if s}
    i_map = {s.lower().strip(): s for s in internship_skills if s}
    matched_keys = set(s_map.keys() & i_map.keys())

    if internship_obj is not None:
        title_cat = f"{getattr(internship_obj, 'title', '')} {getattr(internship_obj, 'category', '')}".lower()
        for k, original in s_map.items():
            if k and len(k) >= 2 and k in title_cat:
                matched_keys.add(k)

    return [s_map[k] for k in sorted(matched_keys) if k in s_map]


def _get_embedding(obj, attr, updater):
    """
    Return the stored embedding for `obj`.
    If it is missing/null, regenerate it on-the-fly and save.
    Always fetches from DB so we never use a stale ORM-cached value.
    """
    # Refresh from DB to get the latest embedding column value
    obj.refresh_from_db(fields=[attr])
    embedding = getattr(obj, attr, None)

    if not embedding:
        try:
            embedding = updater(obj)
        except Exception as e:
            logger.warning(f"Could not generate embedding for {obj}: {e}")
            embedding = None

    return embedding


def fast_cosine_similarity(vec1, vec2):
    """Fast in-memory cosine similarity for normalized vectors."""
    if not vec1 or not vec2:
        return 0.0
    try:
        # For L2 normalized embeddings, dot product == cosine similarity (-1.0 to 1.0)
        dot = sum(a * b for a, b in zip(vec1, vec2))
        return max(0.0, min(1.0, dot))
    except Exception:
        return 0.0


def calculate_semantic_score(student_embedding, internship):
    """
    40% weight. Returns 0.0–1.0.
    Calculates cosine similarity between the student embedding and internship embedding.
    """
    if not student_embedding:
        return 0.0

    internship_embedding = getattr(internship, "embedding", None)
    if not internship_embedding:
        return 0.0

    return fast_cosine_similarity(student_embedding, internship_embedding)


def passes_hard_filters(internship, profile):
    """
    Hard constraints — only active listings and a usable profile proceed to AI.

    Preference fields are scoring inputs, not listing-level exclusions. A
    complete profile must still receive ranked results when the current live
    feed has no exact preference match.
    """
    if not profile:
        return False

    if getattr(internship, "status", "active") != "active":
        return False

    return True


def has_recommendation_preferences(profile):
    """Return True only when the student has supplied a real preference."""
    return any((
        getattr(profile, "internship_type", "any") not in (None, "", "any"),
        getattr(profile, "work_type", "either") not in (None, "", "either"),
        getattr(profile, "compensation_preference", "either") not in (None, "", "either"),
        bool(getattr(profile, "preferred_locations", None)),
        bool(getattr(profile, "preferred_industries", None)),
        bool(getattr(profile, "preferred_roles", None)),
        getattr(profile, "internship_duration_min_weeks", None) is not None,
        getattr(profile, "internship_duration_max_weeks", None) is not None,
        bool(getattr(profile, "willing_to_relocate", False)),
    ))


def passes_preference_requirements(internship, profile):
    """Require every explicitly selected preference to match the listing."""
    if not has_recommendation_preferences(profile):
        return False

    if profile.internship_type not in (None, "", "any"):
        if internship.internship_type != profile.internship_type:
            return False

    if profile.work_type not in (None, "", "either"):
        if internship.work_type != profile.work_type:
            return False

    if profile.compensation_preference not in (None, "", "either"):
        if calculate_salary_score(internship, profile) < 1.0:
            return False

    preferred_locations = [
        str(location).lower().strip()
        for location in (profile.preferred_locations or [])
        if location
    ]
    if preferred_locations:
        listing_location = " ".join(filter(None, (
            getattr(internship, "city", ""),
            getattr(internship, "country", ""),
            getattr(internship, "location_text", ""),
        ))).lower()
        if not any(location in listing_location for location in preferred_locations):
            if not ("remote" in preferred_locations and internship.internship_type == "remote"):
                return False

    preferred_industries = {
        str(industry).lower().strip()
        for industry in (profile.preferred_industries or [])
        if industry
    }
    if preferred_industries and (internship.category or "").lower() not in preferred_industries:
        return False

    preferred_roles = [
        str(role).lower().strip()
        for role in (profile.preferred_roles or [])
        if role
    ]
    if preferred_roles:
        listing_role = " ".join(filter(None, (
            getattr(internship, "title", ""),
            getattr(internship, "category", ""),
        ))).lower()
        if not any(role in listing_role for role in preferred_roles):
            return False

    duration_min = getattr(profile, "internship_duration_min_weeks", None)
    duration_max = getattr(profile, "internship_duration_max_weeks", None)
    internship_min = getattr(internship, "duration_min_weeks", None)
    internship_max = getattr(internship, "duration_max_weeks", None)
    if duration_min is not None and internship_max is not None and internship_max < duration_min:
        return False
    if duration_max is not None and internship_min is not None and internship_min > duration_max:
        return False

    return True


def calculate_work_mode_score(internship, profile):
    """Returns 0.0–1.0."""
    if not profile:
        return 0.5

    pref = getattr(profile, "work_type", "either") or "either"
    actual = getattr(internship, "work_type", None)

    if pref in ("either", ""):
        return 1.0
    return 1.0 if actual == pref else 0.0


def calculate_location_score(internship, profile):
    """
    10% weight.  Returns 0.0–1.0.
    Scoring ladder:
      1.0 — exact city match, or remote, or willing_to_relocate
      0.75 — preferred-location match
      0.5  — same country, different city
      0.0  — no match
    """
    if not profile:
        return 0.5

    s_country = (getattr(profile,    "country",  "") or "").lower().strip()
    s_city = (getattr(profile,    "city",     "") or "").lower().strip()
    i_country = (getattr(internship, "country",  "") or "").lower().strip()
    i_city = (getattr(internship, "city",     "") or "").lower().strip()
    i_type = getattr(internship,  "internship_type", "") or ""

    pref_locs = [
        loc.lower().strip()
        for loc in (getattr(profile, "preferred_locations", []) or [])
        if loc
    ]

    if s_city and i_city and s_city == i_city:
        return 1.0
    if i_type == "remote" or getattr(profile, "willing_to_relocate", False):
        return 1.0
    for loc in pref_locs:
        if loc and (loc in i_city or loc in i_country):
            return 0.75
    if s_country and i_country and s_country == i_country:
        return 0.5

    return 0.0


def calculate_salary_score(internship, profile):
    """
    5% weight.  Returns 0.0–1.0.
    """
    if not profile:
        return 0.5

    comp_pref = getattr(
        profile,    "compensation_preference", "either") or "either"
    i_comp_type = getattr(internship, "compensation_type",
                          "unknown") or "unknown"

    if comp_pref == "either":
        return 1.0

    if comp_pref == "paid":
        if i_comp_type != "paid":
            return 0.0
        # Both want paid — check range overlap
        s_min = getattr(profile,    "minimum_compensation", None)
        s_max = getattr(profile,    "maximum_compensation", None)
        i_min = getattr(internship, "minimum_compensation", None)
        i_max = getattr(internship, "maximum_compensation", None)
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


def calculate_preference_score(internship, profile):
    """
    20% weight — average of work-mode, location, salary.
    Returns 0.0–1.0.
    """
    work_mode = calculate_work_mode_score(internship, profile)
    location = calculate_location_score(internship, profile)
    salary = calculate_salary_score(internship, profile)
    return round((work_mode + location + salary) / 3.0, 4)


def calculate_final_score(semantic, skill, preference, location, salary):
    """
    Weighted sum of five 0–1 component scores.
    Returns a single score in 0.0–100.0.
    """
    raw = (
        semantic * SEMANTIC_WEIGHT
        + skill * SKILL_WEIGHT
        + preference * PREFERENCE_WEIGHT
        + location * LOCATION_WEIGHT
        + salary * SALARY_WEIGHT
    )
    return round(min(100.0, max(0.0, raw * 100)), 2)


def build_explanation(semantic, skill, preference, location, salary, matched_skills, internship):
    """
    Human-readable explanation strings based on component scores (all 0–1).
    """
    lines = []

    # Semantic
    if semantic >= 0.80:
        lines.append(
            "Your CV and profile content are highly similar to this internship.")
    elif semantic >= 0.60:
        lines.append(
            "Your profile is semantically relevant to this internship description.")
    elif semantic > 0.0:
        lines.append("Partial semantic match with this internship.")

    # Skills
    if matched_skills:
        lines.append(f"Matching skills: {', '.join(matched_skills[:5])}.")
    if skill >= 0.70:
        lines.append("Strong match with the required technical skills.")
    elif skill >= 0.40:
        lines.append("Several of your skills match this internship.")
    elif skill > 0.0:
        lines.append("Some skill overlap with this internship.")

    # Preference (work mode + location + salary combined)
    if preference >= 0.80:
        lines.append("This internship aligns well with your preferences.")
    elif preference >= 0.50:
        lines.append("This internship partially matches your preferences.")

    # Location
    if location == 1.0:
        lines.append(
            "Location is a great match (remote or your city/country).")
    elif location == 0.75:
        lines.append("Location matches one of your preferred locations.")
    elif location == 0.5:
        lines.append("Same country as your current location.")

    # Salary
    if salary == 1.0 and getattr(internship, "compensation_type", "") == "paid":
        lines.append("Compensation range matches your expectations.")

    if not lines:
        lines.append(
            "This internship was included based on your overall profile match.")

    return lines


# --------------------------------------------------
# Persistence
# --------------------------------------------------

def save_recommendation(student, internship, overall_score,
                        semantic, skill, preference, location, salary,
                        profile=None):
    """
    Upsert a Recommendation row — update scores but preserve feedback status.
    All component scores stored as 0–100.
    """
    from apps.recommendations.models import Recommendation

    try:
        defaults = {
            "overall_score":    overall_score,
            "semantic_score":   round(semantic * 100, 2),
            "skill_score":      round(skill * 100, 2),
            "preference_score": round(preference * 100, 2),
            "location_score":   round(location * 100, 2),
            "salary_score":     round(salary * 100, 2),
        }
        if profile is not None:
            defaults["work_mode_score"] = round(
                calculate_work_mode_score(internship, profile) * 100, 2
            )

        rec, created = Recommendation.objects.get_or_create(
            student=student,
            internship=internship,
            defaults=defaults,
        )

        if not created:
            for k, v in defaults.items():
                setattr(rec, k, v)
            rec.save(update_fields=list(defaults.keys()) + ["updated_at"])

        return rec

    except Exception as e:
        logger.error(
            f"Failed to save recommendation for internship {internship.id}: {e}")
        return None


# --------------------------------------------------
# Helpers to pull merged student skills
# --------------------------------------------------

def _get_student_skills(profile):
    """
    Merge profile skills (manual) + CV extracted skills.
    Returns a deduplicated list of lowercase-trimmed names.
    """
    skills = list(profile.skills.values_list("name", flat=True))
    if hasattr(profile, "interests"):
        skills.extend(list(profile.interests.values_list("name", flat=True)))
    elif hasattr(profile, "career_interests"):
        skills.extend(list(profile.career_interests.values_list("name", flat=True)))

    user = getattr(profile, "user", None)
    if user:
        try:
            from apps.students.models import CV as CVModel, StudentCV

            # Prefer newest completed CV
            completed_cv = (
                CVModel.objects
                .filter(student=user, processing_status=CVModel.STATUS_COMPLETED)
                .order_by("-created_at")
                .first()
            )
            cv_source = completed_cv
            if not cv_source:
                cv_source = StudentCV.objects.filter(student=user).first()

            if cv_source and isinstance(getattr(cv_source, "extracted_skills", None), list):
                skills.extend(cv_source.extracted_skills)
        except Exception:
            pass

    # Deduplicate while preserving case of first occurrence
    seen = set()
    merged = []
    for s in skills:
        key = s.lower().strip()
        if key and key not in seen:
            seen.add(key)
            merged.append(s)
    return merged


# --------------------------------------------------
# Main entry point
# --------------------------------------------------

def generate_recommendations(student, internships, save_to_db=True):
    """
    Score every active internship for this student and return a ranked list.

    Scoring:
      40 % Semantic  (embedding cosine similarity)
      25 % Skills    (name-based overlap, merged profile + CV)
      20 % Preference(work-mode + location + salary average)
      10 % Location  (city / country / remote / preferred-location)
       5 % Salary    (compensation type + range overlap)
    """
    # Always reload the profile fresh so we never score against a stale ORM object
    from apps.students.models import StudentProfile
    try:
        profile = (
            StudentProfile.objects
            .prefetch_related("skills")
            .select_related("user")
            .get(user=student)
        )
    except StudentProfile.DoesNotExist:
        logger.warning(f"No StudentProfile found for user {student.id}")
        return []

    student_skills = _get_student_skills(profile)
    student_embedding = _get_embedding(
        profile, "embedding", update_student_embedding)

    results = []

    for internship in internships:
        # ---- hard filters ----
        if not passes_hard_filters(internship, profile):
            continue

        # ---- 1. semantic (40 %) — uses student_embedding ----
        semantic = calculate_semantic_score(student_embedding, internship)

        # ---- 2. skills (25 %) ----
        if hasattr(internship, "_prefetched_objects_cache") and "required_skills" in internship._prefetched_objects_cache:
            i_skills = [s.name for s in internship.required_skills.all()]
        else:
            i_skills = list(
                internship.required_skills.values_list("name", flat=True)
            )
        if isinstance(getattr(internship, "preferred_skills", None), list):
            i_skills.extend([s for s in internship.preferred_skills if s and isinstance(s, str)])
        skill = calculate_skill_score(student_skills, i_skills, internship_obj=internship)
        matched_skills = get_matched_skills(student_skills, i_skills, internship_obj=internship)

        # ---- 3. preference (20 %) ----
        preference = calculate_preference_score(internship, profile)

        # ---- 4. location (10 %) ----
        location = calculate_location_score(internship, profile)

        # ---- 5. salary (5 %) ----
        salary = calculate_salary_score(internship, profile)

        # ---- final score ----
        final_score = calculate_final_score(
            semantic, skill, preference, location, salary)

        # ---- explanation ----
        explanation = build_explanation(
            semantic, skill, preference, location, salary,
            matched_skills, internship,
        )

        # ---- breakdown (0–100 per component, with weight label) ----
        score_breakdown = {
            "semantic_score":   round(semantic * 100, 2),
            "skill_score":      round(skill * 100, 2),
            "preference_score": round(preference * 100, 2),
            "location_score":   round(location * 100, 2),
            "salary_score":     round(salary * 100, 2),
            "weights": {
                "semantic":   f"{int(SEMANTIC_WEIGHT * 100)}%",
                "skill":      f"{int(SKILL_WEIGHT * 100)}%",
                "preference": f"{int(PREFERENCE_WEIGHT * 100)}%",
                "location":   f"{int(LOCATION_WEIGHT * 100)}%",
                "salary":     f"{int(SALARY_WEIGHT * 100)}%",
            },
        }

        results.append(RecommendationResult(
            internship=internship,
            score=final_score,
            explanation=explanation,
            score_breakdown=score_breakdown,
        ))

    results.sort(key=lambda r: r.score, reverse=True)

    if save_to_db and results:
        # Persist top 50 matches for student recommendation history
        for item in results[:50]:
            try:
                save_recommendation(
                    student, item.internship, item.score,
                    item.score_breakdown.get("semantic_score", 0) / 100.0,
                    item.score_breakdown.get("skill_score", 0) / 100.0,
                    item.score_breakdown.get("preference_score", 0) / 100.0,
                    item.score_breakdown.get("location_score", 0) / 100.0,
                    item.score_breakdown.get("salary_score", 0) / 100.0,
                    profile=profile,
                )
            except Exception:
                pass

    return results
