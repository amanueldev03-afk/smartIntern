from django.urls import path

from .views import (
    StudentProfileView,
    StudentMeView,
    StudentPreferencesView,
    StudentResumeView,
    StudentSkillsAddView,
    StudentSkillsView,
    StudentInterestsView,
    StudentCVUploadView,
    CVStatusView,
    CVStatusLatestView,
    StudentSkillCatalogueView,
    StudentInterestCatalogueView,
    ResumeUploadView,
    ResumeStatusView,
)

urlpatterns = [
    # ----------------------------------------------------------------
    # Phase 3 Task 3.1 — /api/students/me/
    # personal info + education (Sections 5.3.1-5.3.2)
    # ----------------------------------------------------------------
    path(
        "me/",
        StudentMeView.as_view(),
        name="student-me",
    ),

    # ----------------------------------------------------------------
    # Phase 3 Task 3.3 — /api/students/me/preferences/
    # internship preferences: country, city, work_mode, internship_type,
    # availability_start/end (availability_end < start → 400).
    # ----------------------------------------------------------------
    path(
        "me/preferences/",
        StudentPreferencesView.as_view(),
        name="student-me-preferences",
    ),

    # ----------------------------------------------------------------
    # Phase 3 Task 3.4 — /api/students/me/resume/
    # Resume upload. PDF/DOCX only, ≤ 5 MB, MIME content-sniffed.
    # ----------------------------------------------------------------
    path(
        "me/resume/",
        StudentResumeView.as_view(),
        name="student-me-resume",
    ),

    # ----------------------------------------------------------------
    # Phase 3 Task 3.2 — /api/students/me/skills/  &  /interests/
    # Skills & career interests validated against the Task 1.3 catalogue
    # (no free-text). GET list, POST add, DELETE remove.
    # ----------------------------------------------------------------
    path(
        "me/skills/",
        StudentSkillsView.as_view(),
        name="student-me-skills",
    ),
    path(
        "me/interests/",
        StudentInterestsView.as_view(),
        name="student-me-interests",
    ),

    # ----------------------------------------------------------------
    # Profile — GET (retrieve) / PUT / PATCH (update + optional CV)
    # POST is intentionally removed: always update, never create separately.
    # ----------------------------------------------------------------
    path(
        "",
        StudentProfileView.as_view(),
        name="student-profile",
    ),

    # ----------------------------------------------------------------
    # Phase 7 Task 7.2 — /api/students/skills/choices/ & interests/choices/
    # Read-only Task 1.3 catalogues for the student profile editor pickers.
    # ----------------------------------------------------------------
    path(
        "skills/choices/",
        StudentSkillCatalogueView.as_view(),
        name="student-skill-catalogue",
    ),
    path(
        "interests/choices/",
        StudentInterestCatalogueView.as_view(),
        name="student-interest-catalogue",
    ),

    # ----------------------------------------------------------------
    # Skills — add by skill IDs
    # ----------------------------------------------------------------
    path(
        "skills/add/",
        StudentSkillsAddView.as_view(),
        name="student-skills-add",
    ),

    # ----------------------------------------------------------------
    # CV — dedicated upload endpoint (file only, no profile fields)
    # ----------------------------------------------------------------
    path(
        "cv/upload/",
        StudentCVUploadView.as_view(),
        name="student-cv-upload",
    ),

    # ----------------------------------------------------------------
    # CV status — latest / by ID
    # ----------------------------------------------------------------
    path(
        "cv/status/",
        CVStatusLatestView.as_view(),
        name="cv-status-latest",
    ),
    path(
        "cv/<int:cv_id>/status/",
        CVStatusView.as_view(),
        name="cv-status",
    ),
    # ----------------------------------------------------------------
    # Task 2.2 — Automated CV/Resume Parser Pipeline
    # POST /api/v1/students/resume/
    # GET  /api/v1/students/resume/status/<resume_id>/
    # ----------------------------------------------------------------
    path(
        "resume/",
        ResumeUploadView.as_view(),
        name="resume-upload",
    ),
    path(
        "resume/status/<str:resume_id>/",
        ResumeStatusView.as_view(),
        name="resume-status",
    ),
]
