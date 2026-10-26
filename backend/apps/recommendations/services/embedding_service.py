from .semantic_matching import (
    update_internship_embedding,
    update_student_embedding,
)


def generate_internship_embedding_if_needed(internship):
    """
    Generate an internship embedding only if one does not already exist.
    """
    if internship.embedding:
        return internship.embedding
    return update_internship_embedding(internship)


def regenerate_internship_embedding(internship):
    """
    Always regenerate the internship embedding (overwrites existing).
    """
    return update_internship_embedding(internship)


def generate_student_embedding_if_needed(student_profile):
    """
    Generate a student embedding only if one does not already exist.
    """
    if student_profile.embedding:
        return student_profile.embedding
    return update_student_embedding(student_profile)


def regenerate_student_embedding(student_profile):
    """
    Always regenerate the student embedding (overwrites existing).
    """
    return update_student_embedding(student_profile)
