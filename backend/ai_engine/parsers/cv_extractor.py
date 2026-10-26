import os
import re
import io
import zipfile
import logging
from typing import Dict, Any, List, Optional, Union

import magic
import docx

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        PdfReader = None

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Degree keywords for heuristic search
DEGREE_KEYWORDS = [
    "Bachelor of Science",
    "Bachelor of Arts",
    "Bachelor of Engineering",
    "Bachelor of Technology",
    "Bachelor",
    "B.Sc.",
    "B.Sc",
    "BSc",
    "B.S.",
    "B.E.",
    "B.Tech",
    "Master of Science",
    "Master of Arts",
    "Master",
    "M.Sc.",
    "MSc",
    "M.S.",
    "M.Tech",
    "Ph.D.",
    "PhD",
    "Doctor of Philosophy",
    "Diploma",
    "Postgraduate Diploma",
]

# Common computer science & engineering fields of study
FIELD_OF_STUDY_KEYWORDS = [
    "Software Engineering",
    "Computer Science",
    "Information Technology",
    "Information Systems",
    "Computer Engineering",
    "Electrical and Computer Engineering",
    "Electrical Engineering",
    "Data Science",
    "Artificial Intelligence",
    "Cybersecurity",
    "Network Engineering",
    "Civil Engineering",
    "Mechanical Engineering",
    "Biomedical Engineering",
]

# Prominent Ethiopian universities
ETHIOPIAN_UNIVERSITIES = [
    "Addis Ababa University",
    "Addis Ababa Science and Technology University",
    "AASTU",
    "Adama Science and Technology University",
    "ASTU",
    "Hawassa University",
    "Bahir Dar University",
    "Jimma University",
    "Mekelle University",
    "University of Gondar",
    "Gondar University",
    "Arba Minch University",
    "Haramaya University",
    "Dilla University",
    "Wollo University",
    "Dire Dawa University",
    "Debre Berhan University",
    "Debre Markos University",
    "Wolkite University",
    "Ambo University",
    "Wachemo University",
    "Kotebe Metropolitan University",
    "St. Mary's University",
    "Unity University",
    "HilCoE School of Computer Science and Technology",
    "HilCoE",
]


def _read_file_bytes(file_obj_or_path: Union[str, io.BytesIO, Any]) -> tuple[bytes, Optional[str]]:
    """
    Read bytes from a file path, file-like object, or Django UploadedFile.
    Returns (content_bytes, filename).
    """
    filename = None
    if isinstance(file_obj_or_path, str):
        filename = os.path.basename(file_obj_or_path)
        with open(file_obj_or_path, "rb") as f:
            content = f.read()
    else:
        # File-like or Django FieldFile/UploadedFile
        filename = getattr(file_obj_or_path, "name", None)
        if hasattr(file_obj_or_path, "seek"):
            file_obj_or_path.seek(0)
        content = file_obj_or_path.read()
        if hasattr(file_obj_or_path, "seek"):
            file_obj_or_path.seek(0)
    return content, filename


def validate_resume_file(file_obj_or_path: Union[str, io.BytesIO, Any], max_size_bytes: int = MAX_FILE_SIZE) -> None:
    """
    Validate resume file size (max 5MB) and MIME type using python-magic.
    Allowed MIME types:
      - application/pdf
      - application/vnd.openxmlformats-officedocument.wordprocessingml.document
    Handles zip-container format for DOCX.
    Raises ValueError on validation failure.
    """
    content, filename = _read_file_bytes(file_obj_or_path)
    file_size = len(content)

    if file_size == 0:
        raise ValueError("Uploaded file is empty.")

    if file_size > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise ValueError(f"File size exceeds the {max_mb}MB limit. Uploaded size: {file_size / (1024 * 1024):.2f}MB.")

    # Content-sniff MIME type using python-magic
    mime_type = magic.from_buffer(content, mime=True)
    logger.debug(f"Detected MIME type: '{mime_type}' for file '{filename}'")

    if mime_type in ALLOWED_MIME_TYPES:
        return

    # DOCX is packaged as a ZIP archive; verify internal XML structure if python-magic reports zip/octet-stream
    if mime_type in ("application/zip", "application/x-zip-compressed", "application/octet-stream"):
        is_docx = False
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                names = z.namelist()
                if "word/document.xml" in names or "[Content_Types].xml" in names:
                    is_docx = True
        except Exception:
            is_docx = False

        if is_docx:
            return

    ext = os.path.splitext(filename or "")[1].lower()
    raise ValueError(
        f"Unsupported file format '{mime_type}' (extension: '{ext}'). Only PDF (.pdf) and DOCX (.docx) documents are accepted."
    )


def extract_text_from_file(file_obj_or_path: Union[str, io.BytesIO, Any]) -> str:
    """
    Extract raw text from PDF or DOCX file.
    Uses pdfplumber (with fallback to pypdf) for PDFs, python-docx for DOCX.
    """
    content, filename = _read_file_bytes(file_obj_or_path)
    ext = os.path.splitext(filename or "")[1].lower()
    mime_type = magic.from_buffer(content, mime=True)

    is_pdf = mime_type == "application/pdf" or ext == ".pdf"
    is_docx = (
        mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or ext == ".docx"
        or mime_type in ("application/zip", "application/x-zip-compressed")
    )

    if is_pdf:
        return _extract_text_from_pdf(content)
    elif is_docx:
        return _extract_text_from_docx(content)
    else:
        # Attempt PDF first, then DOCX
        try:
            return _extract_text_from_pdf(content)
        except Exception:
            return _extract_text_from_docx(content)


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF using pdfplumber with fallback to pypdf."""
    text_fragments = []

    # 1. Primary: pdfplumber
    if pdfplumber is not None:
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text_fragments.append(extracted)
            if text_fragments:
                return "\n\n".join(text_fragments).strip()
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed, falling back to pypdf: {e}")

    # 2. Fallback: pypdf / PyPDF2
    if PdfReader is not None:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_fragments.append(extracted)
            if text_fragments:
                return "\n\n".join(text_fragments).strip()
        except Exception as e:
            logger.warning(f"pypdf extraction failed: {e}")

    # Return whatever was extracted or empty
    return "\n\n".join(text_fragments).strip()


def _extract_text_from_docx(docx_bytes: bytes) -> str:
    """Extract text from DOCX paragraphs and tables using python-docx."""
    try:
        doc = docx.Document(io.BytesIO(docx_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]

        table_rows = []
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    table_rows.append(row_text)

        all_text = paragraphs + table_rows
        return "\n".join(all_text).strip()
    except Exception as e:
        logger.error(f"python-docx extraction failed: {e}")
        return ""


def extract_emails(text: str) -> List[str]:
    """Extract email addresses from text."""
    pattern = r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
    matches = re.findall(pattern, text)
    # Deduplicate while preserving order
    seen = set()
    emails = []
    for email in matches:
        clean = email.strip().lower()
        if clean not in seen:
            seen.add(clean)
            emails.append(clean)
    return emails


def extract_phones(text: str) -> List[str]:
    """
    Extract Ethiopian phone numbers from text.
    Handles formats:
      +251 91 122 3344
      +251911223344
      0911223344
      +251 71 122 3344
      0711223344
    """
    pattern = r"(?:(?:\+251[\s.-]?)|(?:0))([79](?:[\s.-]?\d){8})\b"
    matches = re.findall(pattern, text)
    phones = []
    seen = set()
    for m in matches:
        clean_digits = re.sub(r"\D", "", m)
        if len(clean_digits) == 9:
            # Canonical standard: +251XXXXXXXXX
            canonical = f"+251{clean_digits}"
            if canonical not in seen:
                seen.add(canonical)
                phones.append(canonical)
    return phones


def extract_urls(text: str) -> Dict[str, Optional[str]]:
    """
    Extract GitHub and LinkedIn profile URLs.
    Detects github.com/<username> and linkedin.com/in/<username>.
    """
    github_pattern = r"(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_-]{1,39})"
    linkedin_pattern = r"(?:https?://)?(?:www\.)?linkedin\.com/in/([a-zA-Z0-9_-]+)"

    gh_match = re.search(github_pattern, text, re.IGNORECASE)
    li_match = re.search(linkedin_pattern, text, re.IGNORECASE)

    github_url = f"https://github.com/{gh_match.group(1)}" if gh_match else None
    linkedin_url = f"https://linkedin.com/in/{li_match.group(1)}" if li_match else None

    return {
        "github_url": github_url,
        "linkedin_url": linkedin_url,
    }


def extract_gpa(text: str) -> Optional[float]:
    """
    Extract GPA from resume text.
    Supports patterns like:
      GPA: 3.85
      GPA 3.85 / 4.0
      CGPA: 3.9
      3.85 / 4.0
    Clamps between 0.0 and 4.0.
    """
    patterns = [
        r"(?:GPA|Grade\s*Point\s*Average|CGPA|Cumulative\s*GPA)[\s:=]*([0-4]\.\d{1,2})",
        r"\b([0-4]\.\d{1,2})\s*/\s*4(?:\.0)?\b",
    ]

    for pat in patterns:
        match = re.search(pat, text, re.IGNORECASE)
        if match:
            try:
                val = float(match.group(1))
                if 0.0 <= val <= 4.0:
                    return round(val, 2)
            except (ValueError, TypeError):
                continue

    return None


def extract_education(text: str) -> Dict[str, Any]:
    """
    Heuristic search for degree keywords, majors, and Ethiopian university names.
    Returns:
      {
        "degree": Optional[str],
        "field_of_study": Optional[str],
        "institution": Optional[str],
      }
    """
    found_degree = None
    for deg in DEGREE_KEYWORDS:
        pattern = r"\b" + re.escape(deg) + r"\b"
        if re.search(pattern, text, re.IGNORECASE):
            found_degree = deg
            break

    found_field = None
    for field in FIELD_OF_STUDY_KEYWORDS:
        pattern = r"\b" + re.escape(field) + r"\b"
        if re.search(pattern, text, re.IGNORECASE):
            found_field = field
            break

    found_university = None
    for uni in ETHIOPIAN_UNIVERSITIES:
        pattern = r"\b" + re.escape(uni) + r"\b"
        if re.search(pattern, text, re.IGNORECASE):
            found_university = uni
            break

    return {
        "degree": found_degree,
        "field_of_study": found_field,
        "institution": found_university,
    }


def extract_skills(text: str) -> List[str]:
    """
    Match extracted tokens and multi-word terms against canonical Skill database table.
    Handles exact case-insensitive matches, multi-word skills, and programming language tokens.
    """
    try:
        from apps.internships.models import Skill
        active_skills = list(
            Skill.objects.filter(is_active=True).values_list("name", flat=True)
        )
    except Exception as e:
        logger.warning(f"Could not query canonical Skill model: {e}")
        active_skills = []

    matched = []
    text_lower = text.lower()

    for skill_name in active_skills:
        name_clean = skill_name.strip()
        if not name_clean:
            continue

        # Handle C++, C#, .NET special characters
        if name_clean in ("C++", "C#", ".NET"):
            pattern = re.escape(name_clean) + r"(?!\w)"
        else:
            pattern = r"\b" + re.escape(name_clean.lower()) + r"\b"

        if re.search(pattern, text_lower if name_clean not in ("C++", "C#") else text):
            matched.append(name_clean)

    # Sort alphabetically
    return sorted(list(set(matched)))


def extract_resume_data(file_obj_or_path: Union[str, io.BytesIO, Any]) -> Dict[str, Any]:
    """
    End-to-end resume extraction pipeline.
    Validates file, extracts text, and parses all entities:
      - Email
      - Phone
      - GitHub URL
      - LinkedIn URL
      - GPA
      - Education details
      - Matched canonical skills
    Returns:
      {
        "text": str,
        "data": {
          "email": Optional[str],
          "phone": Optional[str],
          "github_url": Optional[str],
          "linkedin_url": Optional[str],
          "gpa": Optional[float],
          "education": Dict[str, Any],
          "skills": List[str],
        }
      }
    """
    validate_resume_file(file_obj_or_path)
    text = extract_text_from_file(file_obj_or_path)

    emails = extract_emails(text)
    phones = extract_phones(text)
    urls = extract_urls(text)
    gpa = extract_gpa(text)
    education = extract_education(text)
    skills = extract_skills(text)

    parsed_data = {
        "email": emails[0] if emails else None,
        "emails": emails,
        "phone": phones[0] if phones else None,
        "phones": phones,
        "github_url": urls.get("github_url"),
        "linkedin_url": urls.get("linkedin_url"),
        "gpa": gpa,
        "education": education,
        "skills": skills,
    }

    return {
        "text": text,
        "data": parsed_data,
    }
