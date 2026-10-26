import logging
from typing import Optional, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

PLAGIARISM_THRESHOLD_PCT = 75.0


def check_logbook_plagiarism(
    new_text: str,
    student_id: str,
    week_number: Optional[int] = None,
    logbook_id: Optional[str] = None,
) -> Tuple[float, bool, str]:
    """
    Check candidate weekly logbook text against historical archives of approved logbooks
    using an n-gram TF-IDF vectorizer (unigrams, bigrams, trigrams) and cosine similarity.

    Args:
        new_text: The logbook text to check (e.g. tasks_executed).
        student_id: The ID of the submitting student.
        week_number: Optional week number of the submission.
        logbook_id: Optional UUID/ID of the current logbook being checked.

    Returns:
        tuple[float, bool, str]:
            - max_similarity_score * 100 (percentage, e.g. 92.45)
            - is_flagged: True if similarity score >= 75.0%
            - matched_snippet: Text snippet from the most similar historical logbook
    """
    if not new_text or not new_text.strip():
        return (0.0, False, "")

    candidate_text = new_text.strip()

    # Normalize student_id across User and UILStudentProfile models
    student_id_val = getattr(student_id, "id", student_id)
    user_ids = {student_id_val, str(student_id_val)}
    uil_profile_ids = {student_id_val, str(student_id_val)}

    if isinstance(student_id_val, str) and "@" in student_id_val:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_obj = User.objects.filter(email=student_id_val).first()
        if user_obj:
            user_ids.add(user_obj.id)
            user_ids.add(str(user_obj.id))

    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_obj = User.objects.filter(id=student_id_val).first()
        if user_obj:
            user_ids.add(user_obj.id)
            user_ids.add(str(user_obj.id))
            from apps.uil_profiles.models import UILStudentProfile
            profiles = UILStudentProfile.objects.filter(student__user=user_obj).values_list("id", flat=True)
            for p_id in profiles:
                uil_profile_ids.add(p_id)
                uil_profile_ids.add(str(p_id))
    except Exception:
        pass

    try:
        from apps.uil_profiles.models import UILStudentProfile
        uil_prof = UILStudentProfile.objects.filter(id=student_id_val).select_related("student__user").first()
        if uil_prof:
            uil_profile_ids.add(uil_prof.id)
            uil_profile_ids.add(str(uil_prof.id))
            if hasattr(uil_prof, "student") and hasattr(uil_prof.student, "user") and uil_prof.student.user:
                user_ids.add(uil_prof.student.user.id)
                user_ids.add(str(uil_prof.student.user.id))
    except Exception:
        pass

    corpus = []
    corpus_ids = []

    # 1. Query apps.teams.models.WeeklyLogbook
    try:
        from apps.teams.models import WeeklyLogbook as TeamsLogbook
        qs_teams = TeamsLogbook.objects.filter(advisor_approved=True)
        if logbook_id:
            qs_teams = qs_teams.exclude(id=logbook_id)
        if week_number is not None:
            qs_teams = qs_teams.exclude(student_id__in=uil_profile_ids, week_number=week_number)
        for item_id, text in qs_teams.values_list("id", "tasks_executed"):
            if text and text.strip():
                corpus.append(text.strip())
                corpus_ids.append(item_id)
    except Exception as e:
        logger.debug(f"TeamsWeeklyLogbook check error: {e}")

    # 2. Query apps.projects.models.WeeklyLogbook
    try:
        from apps.projects.models import WeeklyLogbook as ProjectsLogbook
        qs_proj = ProjectsLogbook.objects.filter(advisor_approved=True)
        if logbook_id:
            qs_proj = qs_proj.exclude(id=logbook_id)
        if week_number is not None:
            qs_proj = qs_proj.exclude(student_id__in=user_ids, week_number=week_number)
        for item_id, text in qs_proj.values_list("id", "tasks_executed"):
            if text and text.strip():
                corpus.append(text.strip())
                corpus_ids.append(item_id)
    except Exception as e:
        logger.debug(f"ProjectsWeeklyLogbook check error: {e}")

    if not corpus:
        logger.debug("Historical logbook corpus is empty. Plagiarism score: 0.0%")
        return (0.0, False, "")

    # Vectorize with n-grams (1, 3) and English stop-word filtering
    all_documents = [candidate_text] + corpus
    vectorizer = TfidfVectorizer(ngram_range=(1, 3), stop_words="english")

    try:
        tfidf_matrix = vectorizer.fit_transform(all_documents)
    except ValueError as exc:
        # Occurs if documents only contain stop words or punctuation
        logger.warning(f"TF-IDF vectorizer encountered ValueError: {exc}")
        return (0.0, False, "")

    candidate_vector = tfidf_matrix[0:1]
    corpus_vectors = tfidf_matrix[1:]

    # Compute cosine similarities between candidate and all historical documents
    similarity_matrix = cosine_similarity(candidate_vector, corpus_vectors)
    sim_scores = similarity_matrix[0]

    max_idx = int(sim_scores.argmax())
    max_sim = float(sim_scores[max_idx])
    score_percentage = round(max_sim * 100.0, 2)
    is_flagged = score_percentage >= PLAGIARISM_THRESHOLD_PCT

    matched_text = corpus[max_idx]
    snippet_len = 300
    matched_snippet = matched_text[:snippet_len].strip()
    if len(matched_text) > snippet_len:
        matched_snippet += "..."

    logger.info(
        f"Plagiarism check completed for student={student_id}: "
        f"max_score={score_percentage}%, flagged={is_flagged}, corpus_size={len(corpus)}"
    )

    return (score_percentage, is_flagged, matched_snippet)
