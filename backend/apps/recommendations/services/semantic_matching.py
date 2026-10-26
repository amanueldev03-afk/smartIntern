from functools import lru_cache

from django.conf import settings
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

EMBEDDING_DIMENSION = 384


@lru_cache(maxsize=1)
def get_embedding_model():
    """
    Load the Sentence Transformer model once.
    """
    return SentenceTransformer(settings.EMBEDDING_MODEL_NAME)


def generate_embedding(text):
    """
    Convert text into an embedding vector.
    """
    if not text:
        return []

    model = get_embedding_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def build_student_text(student_profile):
    """
    Build semantic text for a student including profile details and CV text.
    """
    parts = []

    if hasattr(student_profile, "skills"):
        skills = list(
            student_profile.skills.values_list("name", flat=True)
        )
        if skills:
            parts.append("Skills: " + ", ".join(skills))

    if hasattr(student_profile, "career_interests"):
        interests = list(
            student_profile.career_interests.values_list("name", flat=True)
        )
        if interests:
            parts.append("Career Interests: " + ", ".join(interests))

    if getattr(student_profile, "bio", None):
        parts.append("Profile: " + student_profile.bio)

    if getattr(student_profile, "field_of_study", None):
        parts.append("Field of Study: " + student_profile.field_of_study)

    if getattr(student_profile, "education_level", None):
        parts.append("Education: " + student_profile.education_level)

    if getattr(student_profile, "experience", None):
        parts.append("Experience: " + student_profile.experience)

    if getattr(student_profile, "country", None):
        parts.append("Country: " + student_profile.country)

    if getattr(student_profile, "city", None):
        parts.append("City: " + student_profile.city)

    # Include student CV content — check both CV models.
    # The async Celery pipeline writes to `CV`; the legacy pipeline writes to `StudentCV`.
    # We prefer the most recently completed `CV` record, falling back to `StudentCV`.
    user = getattr(student_profile, "user", None)
    if user:
        try:
            from apps.students.models import CV as CVModel, StudentCV

            # Prefer the newer async CV model (STATUS_COMPLETED only)
            cv_data = None
            completed_cv = (
                CVModel.objects
                .filter(student=user, processing_status=CVModel.STATUS_COMPLETED)
                .order_by("-created_at")
                .first()
            )
            if completed_cv:
                cv_data = completed_cv
            else:
                # Fall back to legacy StudentCV
                legacy_cv = StudentCV.objects.filter(student=user).first()
                if legacy_cv:
                    cv_data = legacy_cv

            if cv_data:
                extracted_text = getattr(cv_data, "extracted_text", "") or ""
                extracted_skills = getattr(
                    cv_data, "extracted_skills", []) or []
                extracted_experience = getattr(
                    cv_data, "extracted_experience", []) or []
                extracted_education = getattr(
                    cv_data, "extracted_education", []) or []

                if extracted_text:
                    parts.append("CV Text: " + extracted_text[:1000])
                if extracted_skills and isinstance(extracted_skills, list):
                    parts.append("CV Skills: " + ", ".join(str(s)
                                 for s in extracted_skills if s))
                if extracted_experience and isinstance(extracted_experience, list):
                    exp_items = [str(e) for e in extracted_experience if e]
                    if exp_items:
                        parts.append("CV Experience: " +
                                     "; ".join(exp_items[:5]))
                if extracted_education and isinstance(extracted_education, list):
                    edu_items = [str(e) for e in extracted_education if e]
                    if edu_items:
                        parts.append("CV Education: " +
                                     "; ".join(edu_items[:3]))
        except Exception:
            pass

    if not parts:
        parts.append("Student intern candidate seeking technology opportunities.")

    return "\n".join(parts)


def build_internship_text(internship):
    """
    Build semantic text for an internship.
    """
    parts = []

    if getattr(internship, "title", None):
        parts.append("Title: " + internship.title)

    if getattr(internship, "description", None):
        parts.append("Description: " + internship.description)

    if hasattr(internship, "required_skills"):
        skills = list(
            internship.required_skills.values_list("name", flat=True)
        )
        if skills:
            parts.append("Required skills: " + ", ".join(skills))

    if getattr(internship, "category", None):
        parts.append("Category: " + internship.category)

    if getattr(internship, "internship_type", None):
        parts.append("Internship type: " + internship.internship_type)

    if getattr(internship, "work_type", None):
        parts.append("Work type: " + internship.work_type)

    location_parts = []
    if getattr(internship, "country", None):
        location_parts.append(internship.country)
    if getattr(internship, "city", None):
        location_parts.append(internship.city)
    if location_parts:
        parts.append("Location: " + ", ".join(location_parts))

    return "\n".join(parts)


def generate_student_embedding(student_profile):
    """Generate student's embedding vector."""
    return generate_embedding(build_student_text(student_profile))


def generate_internship_embedding(internship):
    """Generate internship embedding vector."""
    return generate_embedding(build_internship_text(internship))


def calculate_semantic_similarity(student_embedding, internship_embedding):
    """
    Calculate cosine similarity between two embeddings.
    Returns a score in the range 0–100.
    """
    if not student_embedding:
        return 0.0
    if not internship_embedding:
        return 0.0

    similarity = cosine_similarity(
        [student_embedding],
        [internship_embedding],
    )[0][0]

    return round(max(0.0, min(100.0, similarity * 100)), 2)


def validate_embedding(embedding):
    """Validate that the embedding has the correct dimension."""
    if not embedding:
        return False
    return len(embedding) == EMBEDDING_DIMENSION


def update_student_embedding(student_profile):
    """Generate and persist student embedding."""
    embedding = generate_student_embedding(student_profile)
    if not validate_embedding(embedding):
        raise ValueError("Invalid student embedding.")
    student_profile.embedding = embedding
    student_profile.save(update_fields=["embedding"])
    return embedding


def update_internship_embedding(internship):
    """Generate and persist internship embedding."""
    embedding = generate_internship_embedding(internship)
    if not validate_embedding(embedding):
        raise ValueError("Invalid internship embedding.")
    internship.embedding = embedding
    internship.save(update_fields=["embedding"])
    return embedding


def get_student_embedding(student_profile):
    """Return stored student embedding, generating it if missing."""
    if not student_profile.embedding:
        return update_student_embedding(student_profile)
    return student_profile.embedding


def get_internship_embedding(internship):
    """Return stored internship embedding, generating it if missing."""
    if not internship.embedding:
        return update_internship_embedding(internship)
    return internship.embedding


def calculate_stored_semantic_similarity(student_profile, internship):
    """
    Calculate semantic similarity using stored embeddings (auto-generating
    them if absent).
    """
    student_embedding = get_student_embedding(student_profile)
    internship_embedding = get_internship_embedding(internship)
    return calculate_semantic_similarity(student_embedding, internship_embedding)
