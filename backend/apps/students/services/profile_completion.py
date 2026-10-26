"""
Phase 3 Task 3.6 — profile completion indicator (Sections 3.9.1 / 3.9.2).

Computes how complete a student profile is, based on how many of six key
sections are filled: {personal, education, >=1 skill, >=1 interest,
preferences, resume}.

Returned structure powers the dashboard widgets:

    {
        "percent":  50,               # 0..100, total_filled / 6 rounded
        "sections": {
            "personal":    False,
            "education":   True,
            "skills":      True,
            "interests":   False,
            "preferences": False,
            "resume":      True,
        },
    }
"""

# Each section contributes equally (1 of 6). An empty profile yields 0%.
SECTION_NAMES = [
    "personal",
    "education",
    "skills",
    "interests",
    "preferences",
    "resume",
]


def _truthy(value) -> bool:
    """A field counts as filled when it holds a real value."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _personal_complete(profile) -> bool:
    return any(
        _truthy(getattr(profile, field))
        for field in ("phone", "country", "city", "date_of_birth", "bio")
    )


def _education_complete(profile) -> bool:
    return any(
        _truthy(getattr(profile, field))
        for field in (
            "education_level",
            "current_year",
            "field_of_study",
            "university",
        )
    )


# Preference fields with a non-empty default are only "filled" once the
# student expresses a concrete preference, not when left at the default.
_PREFERENCE_DEFAULTS = {
    "work_type": "either",
    "internship_type": "any",
    "compensation_preference": "either",
}


def _preferences_complete(profile) -> bool:
    for field, default in _PREFERENCE_DEFAULTS.items():
        value = getattr(profile, field)
        if value not in ("", default):
            return True

    if _truthy(profile.availability_start) or _truthy(profile.availability_end):
        return True
    if _truthy(profile.preferred_locations):
        return True
    if profile.willing_to_relocate:
        return True
    if profile.minimum_compensation is not None or profile.maximum_compensation is not None:
        return True
    return False


def compute_profile_completion(profile) -> dict:
    """
    Return the profile-completion breakdown for a ``StudentProfile``.
    """
    sections = {
        "personal":    _personal_complete(profile),
        "education":   _education_complete(profile),
        "skills":      profile.skills.exists(),
        "interests":   profile.interests.exists(),
        "preferences": _preferences_complete(profile),
        "resume":      bool(profile.resume),
    }

    filled = sum(1 for complete in sections.values() if complete)
    percent = round(filled * 100 / len(SECTION_NAMES))

    return {
        "percent": percent,
        "sections": sections,
    }
