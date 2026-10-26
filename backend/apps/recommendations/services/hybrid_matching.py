from django.conf import settings

from .preference_matching import calculate_preference_match
from .semantic_matching import calculate_stored_semantic_similarity


def calculate_cv_match_score(student_profile, internship):
    """
    Calculate CV-based matching score by comparing CV-extracted skills
    with internship required skills.
    """
    try:
        from apps.students.models import StudentCV
        cv = StudentCV.objects.filter(student=student_profile.user).first()

        if not cv or not cv.extracted_skills:
            return 0.0

        required_skills = {
            skill.name.lower()
            for skill in internship.required_skills.all()
        }

        if not required_skills:
            return 0.0

        cv_skills = {skill.lower() for skill in cv.extracted_skills}
        matched = required_skills & cv_skills

        return round((len(matched) / len(required_skills)) * 100, 2)

    except Exception:
        return 0.0


def calculate_hybrid_match(student_profile, internship):
    """
    Combine rule-based preference matching with AI semantic matching
    and CV analysis.
    """
    preference_result = calculate_preference_match(student_profile, internship)

    if not preference_result["eligible"]:
        return {"eligible": False, "score": 0.0}

    preference_score = preference_result["score"]
    semantic_score = calculate_stored_semantic_similarity(
        student_profile, internship)
    cv_score = calculate_cv_match_score(student_profile, internship)

    preference_weight = getattr(settings, "PREFERENCE_MATCH_WEIGHT", 0.4)
    semantic_weight = getattr(settings, "SEMANTIC_MATCH_WEIGHT", 0.4)
    cv_weight = getattr(settings, "CV_MATCH_WEIGHT", 0.2)

    total_weight = preference_weight + semantic_weight + cv_weight

    final_score = (
        (preference_score * preference_weight)
        + (semantic_score * semantic_weight)
        + (cv_score * cv_weight)
    ) / total_weight

    return {
        "eligible": True,
        "score": round(final_score, 2),
        "preference_score": round(preference_score, 2),
        "semantic_score": round(semantic_score, 2),
        "cv_score": round(cv_score, 2),
        "score_breakdown": preference_result["scores"],
        "explanation": preference_result["explanation"],
    }
