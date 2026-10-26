import re
from typing import Dict, List, Set

# Stop words commonly occurring in Ethiopian university department titles
STOP_WORDS: Set[str] = {
    "department",
    "dept",
    "faculty",
    "school",
    "college",
    "of",
    "and",
    "the",
    "program",
    "division",
}

# Alias groupings for canonical academic departments in Ethiopian higher education
DEPT_ALIASES: Dict[str, List[str]] = {
    "software engineering": ["software", "software engineering", "se", "sw eng", "swe"],
    "computer science": ["computer science", "cs", "computing", "comp sci"],
    "information technology": ["information technology", "it", "infotech"],
    "information systems": ["information systems", "is", "infosys"],
    "electrical engineering": [
        "electrical engineering",
        "ee",
        "electrical and computer engineering",
        "ece",
        "electrical",
    ],
    "computer engineering": [
        "computer engineering",
        "electrical and computer engineering",
        "ece",
        "ce",
    ],
    "data science": ["data science", "ds", "data"],
    "artificial intelligence": ["artificial intelligence", "ai"],
    "mechanical engineering": ["mechanical engineering", "mechanical", "me"],
    "civil engineering": ["civil engineering", "civil", "ce"],
    "chemical engineering": ["chemical engineering", "chemical", "che"],
    "biomedical engineering": ["biomedical engineering", "biomedical", "bme"],
}

# Stop words commonly occurring in Ethiopian university names
UNIV_STOP_WORDS: Set[str] = {
    "university",
    "univ",
    "institute",
    "institution",
    "of",
    "and",
    "the",
}

# Alias groupings for Ethiopian Universities (acronyms and common naming variations)
UNIV_ALIASES: Dict[str, List[str]] = {
    "addis ababa university": ["aau", "addis ababa university"],
    "addis ababa science and technology university": ["aastu", "addis ababa science and technology university", "addis ababa science and technology"],
    "adama science and technology university": ["astu", "adama science and technology university", "adama science and technology"],
    "bahir dar university": ["bdu", "bahir dar", "bahir dar university"],
    "hawassa university": ["hu", "hawassa", "hawassa university"],
    "jimma university": ["ju", "jimma", "jimma university"],
    "mekelle university": ["mu", "mekelle", "mekelle university"],
    "arba minch university": ["amu", "arba minch", "arba minch university"],
    "debre markos university": ["dmu", "debre markos", "debre markos university"],
    "debre berhan university": ["dbu", "debre berhan", "debre berhan university"],
    "haramaya university": ["haramaya", "hrhu", "haramaya university"],
    "wolaita sodo university": ["wsu", "wolaita sodo", "wolaita sodo university"],
    "wollo university": ["wu", "wollo", "wollo university"],
    "dilla university": ["du", "dilla", "dilla university"],
    "gondar university": ["uog", "university of gondar", "gondar", "gondar university"],
}


def normalize_department_name(dept_str: str) -> str:
    """
    Normalizes a department string by lowercasing, replacing punctuation,
    underscores, hyphens, and slashes with spaces, and stripping common stop words.

    Examples:
        'computer_science' -> 'computer science'
        'Department of Software Engineering' -> 'software engineering'
        'Electrical & Computer Engineering' -> 'electrical computer engineering'
    """
    if not dept_str:
        return ""
    # Lowercase and replace separators with space
    s = dept_str.strip().lower()
    s = re.sub(r"[_\-\/\.,&\+]+", " ", s)
    tokens = [w.strip() for w in s.split() if w.strip() and w.strip() not in STOP_WORDS]
    return " ".join(tokens)


def departments_match(student_dept: str, dean_dept: str) -> bool:
    """
    Compares a student's department against a Department Dean's department
    accounting for naming variations, case differences, snake_case identifiers,
    and official Ethiopian department aliases.
    """
    if not dean_dept:
        return True

    dean_norm = normalize_department_name(dean_dept)
    if not dean_norm or dean_norm in [
        "all",
        "all departments",
        "general",
        "administration",
        "academic",
        "dean",
    ]:
        return True

    if not student_dept:
        return False

    stu_norm = normalize_department_name(student_dept)
    if not stu_norm:
        return False

    # 1. Exact normalized match
    if stu_norm == dean_norm:
        return True

    # 2. Substring match
    if stu_norm in dean_norm or dean_norm in stu_norm:
        return True

    # 3. Token set subset match (e.g. 'software engineering' vs 'software engineering tech')
    stu_tokens = set(stu_norm.split())
    dean_tokens = set(dean_norm.split())
    if stu_tokens and dean_tokens:
        if stu_tokens.issubset(dean_tokens) or dean_tokens.issubset(stu_tokens):
            return True

    # 4. Alias groups matching
    for canonical, aliases in DEPT_ALIASES.items():
        canonical_norm = normalize_department_name(canonical)
        alias_norms = {normalize_department_name(a) for a in aliases} | {canonical_norm}

        dean_in_group = (dean_norm in alias_norms) or any(a in dean_norm for a in alias_norms if len(a) > 2)
        stu_in_group = (stu_norm in alias_norms) or any(a in stu_norm for a in alias_norms if len(a) > 2)

        if dean_in_group and stu_in_group:
            return True

    return False


def normalize_university_name(univ_str: str) -> str:
    """
    Normalizes a university string by lowercasing, stripping punctuation,
    and removing common institutional stopwords.
    """
    if not univ_str:
        return ""
    s = univ_str.strip().lower()
    s = re.sub(r"[_\-\/\.,&\+]+", " ", s)
    tokens = [w.strip() for w in s.split() if w.strip() and w.strip() not in UNIV_STOP_WORDS]
    return " ".join(tokens)


def resolve_canonical_university(univ_str: str) -> str:
    """
    Resolves a university string or abbreviation to its canonical key in UNIV_ALIASES.
    Returns the canonical key if found, or '' if not mapped.
    """
    if not univ_str:
        return ""
    clean = re.sub(r"[_\-\/\.,&\+]+", " ", univ_str.strip().lower()).strip()
    norm = normalize_university_name(univ_str)

    # 1. Exact match against canonical keys or their aliases (check specific ones first, sorted by length desc)
    for canonical in sorted(UNIV_ALIASES.keys(), key=len, reverse=True):
        aliases = UNIV_ALIASES[canonical]
        canon_clean = re.sub(r"[_\-\/\.,&\+]+", " ", canonical.strip().lower()).strip()
        canon_norm = normalize_university_name(canonical)

        if clean == canon_clean or norm == canon_norm:
            return canonical

        for alias in aliases:
            alias_clean = re.sub(r"[_\-\/\.,&\+]+", " ", alias.strip().lower()).strip()
            alias_norm = normalize_university_name(alias)
            if clean == alias_clean or norm == alias_norm:
                return canonical

    # 2. Exact word / acronym match in clean tokens (e.g. "AASTU", "AAU", "ASTU", "BDU")
    clean_words = set(clean.split())
    for canonical in sorted(UNIV_ALIASES.keys(), key=len, reverse=True):
        aliases = UNIV_ALIASES[canonical]
        for alias in aliases:
            alias_clean = re.sub(r"[_\-\/\.,&\+]+", " ", alias.strip().lower()).strip()
            if len(alias_clean) <= 5 and alias_clean in clean_words:
                return canonical

    return ""


def universities_match(univ_a: str, univ_b: str) -> bool:
    """
    Compares two university names accounting for naming variations,
    abbreviations (AAU, ASTU, BDU, etc.), and standard Ethiopian higher-ed aliases.
    """
    if not univ_a and not univ_b:
        return True
    if not univ_a or not univ_b:
        return False

    canon_a = resolve_canonical_university(univ_a)
    canon_b = resolve_canonical_university(univ_b)

    # If both resolved to canonical Ethiopian universities, they match iff canonicals are identical
    if canon_a and canon_b:
        return canon_a == canon_b

    norm_a = normalize_university_name(univ_a)
    norm_b = normalize_university_name(univ_b)

    if not norm_a or not norm_b:
        return False

    # 1. Exact normalized match
    if norm_a == norm_b:
        return True

    # Universities with "science" or "technology" differ fundamentally from comprehensive ones
    sci_tech_a = any(w in norm_a.split() for w in ("science", "technology"))
    sci_tech_b = any(w in norm_b.split() for w in ("science", "technology"))
    if sci_tech_a != sci_tech_b:
        return False

    # 2. Substring match
    if norm_a in norm_b or norm_b in norm_a:
        return True

    # 3. Token set subset match
    tokens_a = set(norm_a.split())
    tokens_b = set(norm_b.split())
    if tokens_a and tokens_b:
        if tokens_a.issubset(tokens_b) or tokens_b.issubset(tokens_a):
            return True

    # 4. If only one has a canonical, check if the other's normalized name matches any alias of that canonical
    if canon_a:
        aliases = UNIV_ALIASES[canon_a]
        alias_norms = {normalize_university_name(a) for a in aliases} | {normalize_university_name(canon_a)}
        if norm_b in alias_norms:
            return True
    if canon_b:
        aliases = UNIV_ALIASES[canon_b]
        alias_norms = {normalize_university_name(a) for a in aliases} | {normalize_university_name(canon_b)}
        if norm_a in alias_norms:
            return True

    return False


def get_user_university(user) -> str:
    """
    Resolves official university affiliation string for any system user.
    """
    if not user:
        return ""
    if getattr(user, "university_name", None):
        return str(user.university_name).strip()
    if hasattr(user, "staff_profile") and user.staff_profile and user.staff_profile.department:
        dept_univ = getattr(user.staff_profile.department, "university_name", None)
        if dept_univ:
            return str(dept_univ).strip()
    if hasattr(user, "student") and user.student:
        if getattr(user.student, "university", None):
            return str(user.student.university).strip()
        if hasattr(user.student, "uil_profile") and getattr(user.student.uil_profile, "campus_city", None):
            return str(user.student.uil_profile.campus_city).strip()
    if hasattr(user, "legacy_student_profile") and user.legacy_student_profile and getattr(user.legacy_student_profile, "university", None):
        return str(user.legacy_student_profile.university).strip()
    if hasattr(user, "student_profile") and user.student_profile and getattr(user.student_profile, "university_name", None):
        return str(user.student_profile.university_name).strip()
    # Check institutional email domain abbreviation if available
    email = getattr(user, "email", "") or ""
    if email and "@" in email:
        domain = email.lower().split("@")[-1].strip()
        domain_sub = domain.split(".")[0].strip()
        for canonical, aliases in UNIV_ALIASES.items():
            if domain_sub in aliases or domain_sub == canonical:
                return canonical.title()
    return ""


def get_user_department(user) -> str:
    """
    Resolves official department affiliation string for any system user.
    """
    if not user:
        return ""
    dept = getattr(user, "department", "") or ""
    if not dept and hasattr(user, "staff_profile") and user.staff_profile and user.staff_profile.department:
        dept = user.staff_profile.department.department_name.strip()
    if not dept and hasattr(user, "student") and user.student and getattr(user.student, "field_of_study", None):
        dept = str(user.student.field_of_study).strip()
    if not dept and hasattr(user, "legacy_student_profile") and user.legacy_student_profile and getattr(user.legacy_student_profile, "field_of_study", None):
        dept = str(user.legacy_student_profile.field_of_study).strip()
    if not dept and hasattr(user, "student_profile") and user.student_profile and getattr(user.student_profile, "department", None):
        dept = str(user.student_profile.department).strip()
    return dept.strip()


def get_student_profile_university(student_profile) -> str:
    """
    Resolves official university affiliation for a UILStudentProfile.
    """
    if not student_profile:
        return ""
    user = getattr(student_profile, "user", None)
    if user:
        u_univ = get_user_university(user)
        if u_univ:
            return u_univ
    stu = getattr(student_profile, "student", None)
    if stu and getattr(stu, "university", None):
        return str(stu.university).strip()
    if getattr(student_profile, "campus_city", None):
        return str(student_profile.campus_city).strip()
    return ""


def get_student_profile_department(student_profile) -> str:
    """
    Resolves official academic department for a UILStudentProfile.
    """
    if not student_profile:
        return ""
    if getattr(student_profile, "department", None):
        return str(student_profile.department).strip()
    user = getattr(student_profile, "user", None)
    if user:
        return get_user_department(user)
    stu = getattr(student_profile, "student", None)
    if stu and getattr(stu, "field_of_study", None):
        return str(stu.field_of_study).strip()
    return ""


def format_dean_title(dean_user) -> str:
    """
    Formats the official institutional title for a Department Dean.
    Ensures 'Dean Dr. <Name>' or respect existing titles.
    """
    if not dean_user:
        return "Department Dean"
    name = (dean_user.full_name or dean_user.email).strip()
    name_lower = name.lower()
    if name_lower.startswith("dean dr.") or name_lower.startswith("dean dr "):
        return name
    if name_lower.startswith("dr.") or name_lower.startswith("dr "):
        return f"Dean {name}"
    if name_lower.startswith("dean"):
        # e.g. "Dean Amanuel" -> "Dean Dr. Amanuel"
        parts = name.split(" ", 1)
        if len(parts) > 1:
            return f"Dean Dr. {parts[1]}"
        return f"Dean Dr. {name}"
    return f"Dean Dr. {name}"


def get_or_create_dean_qr_code(dean_user, dean_dept: str = "") -> str:
    """
    Returns a persistent, canonical Base64 QR code unique to this Department Dean.
    One department dean has only ONE unique QR code across all applications:
    - Official Internship Clearance Letter
    - Dorm & Cafeteria Clearance Letter
    - Official Score Letter
    """
    from django.conf import settings
    import json
    import hmac
    import hashlib
    from apps.common.qr_generator import generate_base64_qr

    if not dean_user:
        return ""

    dept = dean_dept or getattr(dean_user, "department", "") or ""
    if not dept and hasattr(dean_user, "staff_profile") and dean_user.staff_profile and dean_user.staff_profile.department:
        dept = dean_user.staff_profile.department.department_name.strip()
    if not dept:
        dept = "Academic Department"

    dean_title = format_dean_title(dean_user)
    dean_name = (getattr(dean_user, "full_name", None) or f"{dean_user.first_name} {dean_user.last_name}".strip() or dean_user.email).strip()

    # Deterministic HMAC key for this Dean
    dean_sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"OFFICIAL_DEAN_CREDENTIAL:{dean_user.id}:{dept}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    payload = json.dumps({
        "protocol": "SMARTINTERN-OFFICIAL-DEAN-CREDENTIAL-V1",
        "issuer": "DEPARTMENT_DEAN",
        "dean_id": str(dean_user.id),
        "dean_name": dean_name,
        "dean_title": dean_title,
        "department": dept,
        "institution": getattr(dean_user, "university_name", "Addis Ababa University") or "Addis Ababa University",
        "signature_hash": dean_sig,
        "status": "AUTHENTIC_DEPARTMENT_DEAN_VERIFIED",
        "authorized_documents": [
            "OFFICIAL_INTERNSHIP_CLEARANCE_LETTER",
            "CAMPUS_DORMITORY_CAFETERIA_CLEARANCE_LETTER",
            "OFFICIAL_ACADEMIC_SCORE_ROSTER",
        ],
    }, sort_keys=True)

    return generate_base64_qr(payload)


