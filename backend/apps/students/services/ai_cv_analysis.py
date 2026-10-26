import re
import json
import logging

from django.conf import settings
from openai import OpenAI

from .skill_normalization import normalize_skills

logger = logging.getLogger(__name__)


def get_openai_client():
    """
    Return an OpenAI client if configured.
    """

    api_key = getattr(
        settings,
        "OPENAI_API_KEY",
        None,
    )

    if not api_key:
        return None

    return OpenAI(
        api_key=api_key
    )


CV_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "skills": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "degree": {
                        "type": "string"
                    },
                    "institution": {
                        "type": "string"
                    },
                    "field": {
                        "type": "string"
                    },
                    "start_year": {
                        "type": [
                            "integer",
                            "null"
                        ]
                    },
                    "end_year": {
                        "type": [
                            "integer",
                            "null"
                        ]
                    }
                },
                "required": [
                    "degree",
                    "institution",
                    "field",
                    "start_year",
                    "end_year"
                ],
                "additionalProperties": False
            }
        },
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string"
                    },
                    "company": {
                        "type": "string"
                    },
                    "description": {
                        "type": "string"
                    }
                },
                "required": [
                    "title",
                    "company",
                    "description"
                ],
                "additionalProperties": False
            }
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string"
                    },
                    "description": {
                        "type": "string"
                    },
                    "technologies": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    }
                },
                "required": [
                    "name",
                    "description",
                    "technologies"
                ],
                "additionalProperties": False
            }
        },
        "certifications": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string"
                    },
                    "issuer": {
                        "type": [
                            "string",
                            "null"
                        ]
                    },
                    "date": {
                        "type": [
                            "string",
                            "null"
                        ]
                    }
                },
                "required": [
                    "name",
                    "issuer",
                    "date"
                ],
                "additionalProperties": False
            }
        },
        "languages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string"
                    },
                    "proficiency": {
                        "type": [
                            "string",
                            "null"
                        ]
                    }
                },
                "required": [
                    "name",
                    "proficiency"
                ],
                "additionalProperties": False
            }
        },
        "experience_years": {
            "type": "number",
            "description": "Total years of professional experience calculated from experience entries"
        }
    },
    "required": [
        "skills",
        "education",
        "experience",
        "projects",
        "certifications",
        "languages"
    ],
    "additionalProperties": False
}


def build_cv_prompt(cv_text):
    return f"""
Analyze the following student's CV.

Extract all information explicitly supported by the CV. Do not invent information.

Identify:

1. Technical and professional skills.
2. Education.
3. Work/internship experience.
4. Projects — Extract EVERY project mentioned in the CV. Do not limit to only one project.
   If the student has 2, 3, 4, 5, or more projects, extract every single one of them as a separate object with:
   - `name`: string (e.g. "Hospital Management System")
   - `description`: string (details of what was built, key features, architecture)
   - `technologies`: array of strings (e.g. ["Python", "Django", "React", "PostgreSQL"])
5. Certifications — extract EACH certification separately as an object with
   `name` (required), `issuer` (optional, may be null), and `date` (optional,
   may be null). Do NOT combine multiple certifications into a single string.
6. Languages — extract EACH language separately as an object with `name`
   (required) and `proficiency` (optional, e.g. "Native", "Fluent",
   "Conversational", "Intermediate", "Basic"; may be null if not stated).

Normalize obvious variations where appropriate (e.g. "Django REST Framework" and "Django REST API" -> consistent skill).

IMPORTANT FOR PROJECTS: You MUST extract ALL projects from all project sections, bullets, portfolios, or coursework. Never omit any project.

CV:

{cv_text}
"""


def analyze_cv_with_ai(cv_text):
    """
    Analyze CV text using OpenAI gpt-4o-mini.
    Returns structured dict on success, None on any failure.
    Logs all errors so failures are visible in Celery worker logs.
    """
    client = get_openai_client()

    if client is None:
        logger.warning(
            "OpenAI client not configured (OPENAI_API_KEY missing). "
            "Falling back to deterministic CV parser."
        )
        return None

    prompt = build_cv_prompt(cv_text)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a CV analyzer. "
                        "Extract structured data from CVs in JSON format."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            timeout=30,
        )

        text = response.choices[0].message.content

        if not text:
            logger.warning("OpenAI returned empty content for CV analysis.")
            return None

        result = json.loads(text)
        logger.info(
            f"OpenAI CV analysis succeeded — "
            f"{len(result.get('skills', []))} skills, "
            f"{len(result.get('experience', []))} experience items extracted."
        )
        return result

    except json.JSONDecodeError as exc:
        logger.error(f"OpenAI returned invalid JSON: {exc}")
        return None
    except Exception as exc:
        logger.error(
            f"OpenAI CV analysis failed: {type(exc).__name__}: {exc}",
            exc_info=True,
        )
        return None


def _normalize_certifications(value):
    """Coerce AI certifications output into a list of structured objects.

    Accepts either the new structured shape
    ``[{"name": ..., "issuer": ..., "date": ...}, ...]`` or the legacy
    flat-string shape ``["AWS Certified Developer", ...]`` and always
    returns the structured form.
    """
    if not isinstance(value, list):
        return []

    normalised = []
    for item in value:
        if isinstance(item, str):
            name = item.strip()
            if name:
                normalised.append({"name": name, "issuer": None, "date": None})
            continue
        if isinstance(item, dict):
            name = (item.get("name") or "").strip()
            if not name:
                continue
            normalised.append({
                "name": name,
                "issuer": item.get("issuer") or None,
                "date": item.get("date") or None,
            })
    return normalised


def _normalize_languages(value):
    """Coerce AI languages output into ``[{"name": ..., "proficiency": ...}]``."""
    if not isinstance(value, list):
        return []
    normalised = []
    for item in value:
        if isinstance(item, str):
            name = item.strip()
            if name:
                normalised.append({"name": name, "proficiency": None})
            continue
        if isinstance(item, dict):
            name = (item.get("name") or "").strip()
            if not name:
                continue
            proficiency = item.get("proficiency")
            normalised.append({
                "name": name,
                "proficiency": (proficiency.strip() if isinstance(proficiency, str) and proficiency.strip() else None),
            })
    return normalised


def normalize_ai_result(data):
    """
    Ensure AI output has the expected structure.

    Phase 6 Task 6.1 — Added experience_years to normalization.
    Phase 7 — Certifications and languages are normalised into structured
    objects even if the model returned them as plain strings.
    """

    if not isinstance(data, dict):
        return None

    return {
        "skills": (
            data.get("skills", [])
            if isinstance(
                data.get("skills", []),
                list,
            )
            else []
        ),
        "education": (
            data.get("education", [])
            if isinstance(
                data.get("education", []),
                list,
            )
            else []
        ),
        "experience": (
            data.get("experience", [])
            if isinstance(
                data.get("experience", []),
                list,
            )
            else []
        ),
        "projects": (
            data.get("projects", [])
            if isinstance(
                data.get("projects", []),
                list,
            )
            else []
        ),
        "certifications": _normalize_certifications(
            data.get("certifications", []),
        ),
        "languages": _normalize_languages(
            data.get("languages", []),
        ),
        "experience_years": (
            data.get("experience_years", 0.0)
            if isinstance(
                data.get("experience_years", 0.0),
                (int, float),
            )
            else 0.0
        ),
    }


def merge_skills(
    basic_skills,
    ai_skills,
):
    """
    Merge deterministic and AI-extracted skills.
    """

    combined = set()

    for skill in basic_skills:
        if isinstance(skill, str):
            combined.add(
                skill.strip()
            )

    for skill in ai_skills:
        if isinstance(skill, str):
            skill = skill.strip()

            if skill:
                combined.add(skill)

    return sorted(combined)


def merge_projects(basic_projects, ai_projects):
    """
    Merge deterministic and AI-extracted projects to ensure NO project is missed.
    Deduplicates by fuzzy lowercase project name and merges technology tags.
    """
    merged = []
    seen_names = set()

    def norm_name(name):
        return re.sub(r'[^a-zA-Z0-9]', '', (name or '').lower())

    for proj in (ai_projects or []):
        if not isinstance(proj, dict):
            continue
        name = (proj.get("name") or "").strip()
        if not name:
            continue
        key = norm_name(name)
        seen_names.add(key)
        merged.append({
            "name": name,
            "description": (proj.get("description") or "").strip(),
            "technologies": [t.strip() for t in proj.get("technologies", []) if isinstance(t, str) and t.strip()],
        })

    for proj in (basic_projects or []):
        if not isinstance(proj, dict):
            continue
        name = (proj.get("name") or "").strip()
        if not name:
            continue
        key = norm_name(name)
        already_seen = any(key in s or s in key for s in seen_names if len(
            key) > 3 and len(s) > 3) or (key in seen_names)
        if not already_seen:
            seen_names.add(key)
            merged.append({
                "name": name,
                "description": (proj.get("description") or "").strip(),
                "technologies": [t.strip() for t in proj.get("technologies", []) if isinstance(t, str) and t.strip()],
            })
        else:
            for existing in merged:
                if norm_name(existing["name"]) == key or (len(key) > 3 and key in norm_name(existing["name"])):
                    existing_techs = set(t.lower()
                                         for t in existing["technologies"])
                    for t in proj.get("technologies", []):
                        if isinstance(t, str) and t.strip() and t.strip().lower() not in existing_techs:
                            existing["technologies"].append(t.strip())
                            existing_techs.add(t.strip().lower())
                    if not existing.get("description") and proj.get("description"):
                        existing["description"] = proj.get(
                            "description", "").strip()

    return merged


def analyze_cv_intelligently(cv_text, basic_analysis):
    """
    Merge deterministic CV analysis with AI analysis.
    Always returns a valid dict — falls back to basic_analysis if AI fails.
    """
    ai_result = analyze_cv_with_ai(cv_text)

    if ai_result is None:
        logger.info(
            "Using deterministic CV analysis only (AI unavailable or failed).")
        return basic_analysis

    ai_result = normalize_ai_result(ai_result)

    if ai_result is None:
        logger.warning(
            "AI result failed normalisation — falling back to deterministic.")
        return basic_analysis

    merged_skills = normalize_skills(
        merge_skills(basic_analysis.get("skills", []), ai_result["skills"])
    )

    merged_projects = merge_projects(
        basic_analysis.get("projects", []),
        ai_result.get("projects", []),
    )

    logger.info(
        f"AI + deterministic merge complete — "
        f"{len(merged_skills)} total skills, {len(merged_projects)} total projects "
        f"(AI proj: {len(ai_result.get('projects', []))}, basic proj: {len(basic_analysis.get('projects', []))})."
    )

    return {
        "skills":         merged_skills,
        "education":      ai_result["education"] or basic_analysis.get("education",      []),
        "experience":     ai_result["experience"] or basic_analysis.get("experience",     []),
        "projects":       merged_projects,
        "certifications": ai_result["certifications"] or basic_analysis.get("certifications", []),
        "languages":      ai_result["languages"] or basic_analysis.get("languages",      []),
        "experience_years": ai_result.get("experience_years", 0.0) or basic_analysis.get("experience_years", 0.0),
    }
