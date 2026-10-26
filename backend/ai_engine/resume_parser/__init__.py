"""
resume_parser/ — CV text extraction and structured data parsing.

Pipeline (mirrors business spec step 1):
  1. extract_text()       — PDF/DOCX → raw text  (pypdf / python-docx)
  2. parse_with_spacy()   — spaCy NER for names, orgs, dates as pre-filter
  3. parse_cv()           — deterministic keyword parser (cv_analysis.py)
  4. parse_cv_with_ai()   — OpenAI GPT-4o-mini structured extraction
  5. merge and normalize  — deduplicate skills, normalize aliases

Delegates to apps.students.services.* for the heavy lifting.
spaCy is used here for lightweight NER that runs without OpenAI.
"""

from __future__ import annotations
from typing import Optional
from ai_engine.models import ParsedCV


def extract_text(file_path: str) -> str:
    """
    Extract raw text from a PDF or DOCX file.
    Returns empty string on failure.
    """
    try:
        from apps.students.services.cv_extraction import extract_text_from_file
        return extract_text_from_file(file_path) or ""
    except ImportError:
        return _extract_text_fallback(file_path)


def _extract_text_fallback(file_path: str) -> str:
    """Direct extraction without Django (for standalone use)."""
    import os
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        elif ext in (".docx", ".doc"):
            from docx import Document
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs)
    except Exception:
        pass
    return ""


def parse_with_spacy(text: str) -> dict:
    """
    Run spaCy NER on CV text to extract named entities (organisations,
    dates, people) as supplementary signals for the structured parser.
    Returns a dict with keys: orgs, dates, persons.
    """
    if not text:
        return {"orgs": [], "dates": [], "persons": []}

    try:
        import spacy
        # Load the small English model (must be downloaded once:
        #   python -m spacy download en_core_web_sm)
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            return {"orgs": [], "dates": [], "persons": []}

        doc = nlp(text[:10_000])   # cap input to avoid slow processing
        result: dict[str, list[str]] = {"orgs": [], "dates": [], "persons": []}
        for ent in doc.ents:
            if ent.label_ == "ORG":
                result["orgs"].append(ent.text)
            elif ent.label_ == "DATE":
                result["dates"].append(ent.text)
            elif ent.label_ == "PERSON":
                result["persons"].append(ent.text)
        return result
    except ImportError:
        return {"orgs": [], "dates": [], "persons": []}


def parse_cv(text: str) -> ParsedCV:
    """
    Parse CV text using the deterministic keyword parser.
    No external API calls — works offline.

    Phase 6 Task 6.1 — Includes experience_years in output contract.
    """
    if not text:
        return ParsedCV(raw_text=text)

    try:
        from apps.students.services.cv_analysis import analyze_cv
        result = analyze_cv(text)
    except ImportError:
        result = {}

    return ParsedCV(
        skills=result.get("skills", []),
        education=result.get("education", []),
        experience=result.get("experience", []),
        projects=result.get("projects", []),
        certifications=result.get("certifications", []),
        experience_years=result.get("experience_years", 0.0),
        raw_text=text,
    )


def parse_cv_with_ai(text: str, fallback: Optional[ParsedCV] = None) -> ParsedCV:
    """
    Parse CV text using OpenAI GPT-4o-mini.
    Falls back to deterministic parse if OpenAI is unavailable.

    Phase 6 Task 6.1 — Includes experience_years in output contract.
    """
    if not text:
        return fallback or ParsedCV(raw_text=text)

    try:
        from apps.students.services.ai_cv_analysis import (
            analyze_cv_intelligently,
        )
        from apps.students.services.cv_analysis import analyze_cv

        basic = analyze_cv(text)
        result = analyze_cv_intelligently(text, basic)
    except ImportError:
        result = {}

    if not result:
        return fallback or parse_cv(text)

    return ParsedCV(
        skills=result.get("skills", []),
        education=result.get("education", []),
        experience=result.get("experience", []),
        projects=result.get("projects", []),
        certifications=result.get("certifications", []),
        experience_years=result.get("experience_years", 0.0),
        raw_text=text,
    )
