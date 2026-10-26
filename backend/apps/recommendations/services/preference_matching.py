from decimal import Decimal


WEIGHTS = {
    "skills": 0.40,
    "work_mode": 0.15,
    "payment": 0.15,
    "location": 0.10,
    "internship_type": 0.10,
    "industry": 0.05,
    "duration": 0.05,
}


def calculate_skill_score(student_profile, internship):
    """Calculate skill compatibility score (0–100)."""
    required_skill_ids = set(
        internship.required_skills.values_list("id", flat=True)
    )

    if not required_skill_ids:
        return 0.0

    student_skill_ids = set(
        student_profile.skills.values_list("id", flat=True)
    )

    matched = required_skill_ids & student_skill_ids
    return round((len(matched) / len(required_skill_ids)) * 100, 2)


def calculate_work_mode_score(student_profile, internship):
    preferred_modes = set()
    if student_profile.work_type == "full_time":
        preferred_modes.add("full_time")
    elif student_profile.work_type == "part_time":
        preferred_modes.add("part_time")
    # "either" means no preference

    if not preferred_modes:
        return 50.0

    if internship.work_type in preferred_modes:
        return 100.0

    return 0.0


def calculate_location_score(student_profile, internship):
    preferred_locations = {
        loc.lower()
        for loc in (student_profile.preferred_locations or [])
    }

    if not preferred_locations:
        return 50.0

    internship_location_parts = []
    if internship.city:
        internship_location_parts.append(internship.city.lower())
    if internship.country:
        internship_location_parts.append(internship.country.lower())
    if internship.location_text:
        internship_location_parts.append(internship.location_text.lower())

    internship_location = " ".join(internship_location_parts)

    for loc in preferred_locations:
        if loc and loc in internship_location:
            return 100.0

    if "remote" in preferred_locations and internship.internship_type == "remote":
        return 100.0

    return 0.0


def calculate_payment_score(student_profile, internship):
    preference = student_profile.compensation_preference or "either"
    internship_payment_type = internship.compensation_type

    if preference == "either":
        return 100.0

    if preference == "paid" and internship_payment_type != "paid":
        return 0.0

    if preference == "unpaid" and internship_payment_type != "unpaid":
        return 0.0

    if preference == "unpaid":
        return 100.0

    student_min = student_profile.minimum_compensation
    student_max = student_profile.maximum_compensation
    internship_min = internship.minimum_compensation
    internship_max = internship.maximum_compensation

    if (
        student_min is None
        or student_max is None
        or internship_min is None
        or internship_max is None
    ):
        return 100.0

    if internship_max < student_min or internship_min > student_max:
        return 0.0

    return 100.0


def calculate_internship_type_score(student_profile, internship):
    preferred_type = student_profile.internship_type

    if preferred_type == "any":
        return 50.0

    if internship.internship_type == preferred_type:
        return 100.0

    return 0.0


def calculate_industry_score(student_profile, internship):
    preferred_industries = {
        industry.lower()
        for industry in (student_profile.preferred_industries or [])
    }

    if not preferred_industries:
        return 50.0

    internship_industry = (internship.category or "").lower()

    if internship_industry in preferred_industries:
        return 100.0

    return 0.0


def calculate_duration_score(student_profile, internship):
    student_min = student_profile.internship_duration_min_weeks
    student_max = student_profile.internship_duration_max_weeks
    internship_min = internship.duration_min_weeks
    internship_max = internship.duration_max_weeks

    if (
        student_min is None
        or student_max is None
        or internship_min is None
        or internship_max is None
    ):
        return 50.0

    if internship_max < student_min or internship_min > student_max:
        return 0.0

    return 100.0


def passes_hard_filters(student_profile, internship):
    """
    Determine whether an internship should be considered at all.
    """
    if internship.status != "active":
        return False

    if (
        student_profile.compensation_preference == "paid"
        and internship.compensation_type != "paid"
    ):
        return False

    if (
        student_profile.compensation_preference == "unpaid"
        and internship.compensation_type != "unpaid"
    ):
        return False

    return True


def calculate_preference_match(student_profile, internship):
    """
    Calculate the complete preference match score.
    """
    if not passes_hard_filters(student_profile, internship):
        return {
            "eligible": False,
            "score": 0.0,
            "reason": "Internship does not satisfy required conditions.",
        }

    scores = {
        "skills": calculate_skill_score(student_profile, internship),
        "work_mode": calculate_work_mode_score(student_profile, internship),
        "payment": calculate_payment_score(student_profile, internship),
        "location": calculate_location_score(student_profile, internship),
        "internship_type": calculate_internship_type_score(student_profile, internship),
        "industry": calculate_industry_score(student_profile, internship),
        "duration": calculate_duration_score(student_profile, internship),
    }

    final_score = sum(scores[key] * WEIGHTS[key] for key in scores)
    explanation = generate_match_explanation(student_profile, internship, scores)

    return {
        "eligible": True,
        "score": round(final_score, 2),
        "scores": scores,
        "explanation": explanation,
    }


def get_skill_match_details(student_profile, internship):
    required_skills = set(internship.required_skills.all())
    student_skills = set(student_profile.skills.all())
    matched = required_skills & student_skills
    missing = required_skills - student_skills

    return {
        "matched_skills": [skill.name for skill in matched],
        "missing_skills": [skill.name for skill in missing],
    }


def generate_match_explanation(student_profile, internship, scores):
    skill_details = get_skill_match_details(student_profile, internship)
    preferences_matched = []

    if scores["work_mode"] >= 100:
        preferences_matched.append(internship.work_type)
    if scores["payment"] >= 100:
        preferences_matched.append("Payment preference")
    if scores["location"] >= 100:
        preferences_matched.append("Preferred location")
    if scores["internship_type"] >= 100:
        preferences_matched.append("Preferred internship type")
    if scores["industry"] >= 100:
        preferences_matched.append("Preferred industry")
    if scores["duration"] >= 100:
        preferences_matched.append("Preferred duration")

    score = sum(scores[key] * WEIGHTS[key] for key in scores)

    if score >= 80:
        summary = "Strong match for your internship preferences."
    elif score >= 60:
        summary = "Good match for your internship preferences."
    elif score >= 40:
        summary = "Partial match for your internship preferences."
    else:
        summary = "Low match for your internship preferences."

    return {
        "summary": summary,
        "matched_skills": skill_details["matched_skills"],
        "missing_skills": skill_details["missing_skills"],
        "preferences_matched": preferences_matched,
        "payment_match": scores["payment"] >= 100,
        "location_match": scores["location"] >= 100,
        "duration_match": scores["duration"] >= 100,
    }
