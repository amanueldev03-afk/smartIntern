ALIASES = {
    "django rest framework": "Django REST Framework",
    "drf": "Django REST Framework",
    "postgres": "PostgreSQL",
    "postgres db": "PostgreSQL",
    "js": "JavaScript",
    "ts": "TypeScript",
    "reactjs": "React",
    "node": "Node.js",
    "nodejs": "Node.js",
    "scikit learn": "scikit-learn",
}

def normalize_skill_name(
    skill_name
):
    value = skill_name.strip()

    if not value:
        return None

    key = value.lower()

    return ALIASES.get(
        key,
        value,
    )


def normalize_skills(
    skills
):
    normalized = set()

    for skill in skills:

        if not isinstance(
            skill,
            str,
        ):
            continue

        value = normalize_skill_name(
            skill
        )

        if value:
            normalized.add(value)

    return sorted(normalized)