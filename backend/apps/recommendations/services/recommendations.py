from .recommendation_engine_v2 import generate_recommendations


def get_student_recommendations(student_profile, internships, save_to_db=False):
    """
    Thin shim: generate recommendations for a student profile.
    Returns a list of plain dicts instead of RecommendationResult objects.
    """
    student = getattr(student_profile, "user", None)
    if not student:
        return []

    rec_results = generate_recommendations(
        student=student,
        internships=internships,
        save_to_db=save_to_db,
    )

    return [
        {
            "internship": res.internship,
            "score": res.score,
            "score_breakdown": res.score_breakdown,
            "explanation": res.explanation,
        }
        for res in rec_results
    ]
