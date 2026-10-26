def calculate_skill_match(student, internship):
    """
    Calculate the percentage of internship-required skills that the student has.
    Uses skill ID intersection (profile-based matching).
    """
    required_skills = set(
        internship.required_skills.values_list("id", flat=True)
    )

    if not required_skills:
        return 0.0

    student_skills = set(
        student.skills.values_list("id", flat=True)
    )

    matched_skills = required_skills & student_skills

    return round((len(matched_skills) / len(required_skills)) * 100, 2)
