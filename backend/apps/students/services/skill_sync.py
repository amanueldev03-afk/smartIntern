from apps.internships.models import Skill


def sync_cv_skills_to_profile(
    student_profile,
    extracted_skills,
    source="manual",
):
    """
    Synchronize CV-extracted skills with
    the student's existing skills.

    Updates ``StudentProfile.skills`` (the direct M2M the frontend reads)
    and, when a ``Student`` entity exists, also writes ``StudentSkill``
    through-table entries for source tracking (Phase 6).

    Args:
        student_profile: The StudentProfile instance
        extracted_skills: List of skill names extracted from CV
        source: Source of the skills - "manual" or "resume" (default: "manual")
                 Phase 6 Task 6.1: Resume-extracted skills are marked with source='resume'
    """

    if not extracted_skills:
        return

    from apps.students.models import StudentSkill, Student

    skills = []

    for skill_name in extracted_skills:

        skill, _ = Skill.objects.get_or_create(
            name=skill_name
        )

        skills.append(skill)

    # Always update the direct M2M on StudentProfile — this is what the
    # frontend profile API and cv_data.merged_skills computation read.
    student_profile.skills.set(skills)

    # Phase 6: also record in the StudentSkill through-table (source tracking)
    # when the legacy Student entity exists. Missing Student is non-fatal.
    try:
        student = Student.objects.get(user=student_profile.user)
    except Student.DoesNotExist:
        student = None

    if student is not None:
        StudentSkill.objects.filter(student=student).delete()
        for skill in skills:
            StudentSkill.objects.create(
                student=student,
                skill=skill,
                source=source,
            )