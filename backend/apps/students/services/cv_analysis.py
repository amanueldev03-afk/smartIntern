import re


def normalize_text(text):
    """
    Normalize CV text before analysis.
    """

    if not text:
        return ""

    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


KNOWN_SKILLS = {
    "python": "Python",
    "django": "Django",
    "flask": "Flask",
    "fastapi": "FastAPI",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "react": "React",
    "next.js": "Next.js",
    "node.js": "Node.js",
    "java": "Java",
    "spring": "Spring",
    "c++": "C++",
    "c#": "C#",
    "php": "PHP",
    "laravel": "Laravel",
    "sql": "SQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "git": "Git",
    "github": "GitHub",
    "rest api": "REST API",
    "graphql": "GraphQL",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "Google Cloud",
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "scikit-learn": "scikit-learn",
    "pandas": "Pandas",
    "numpy": "NumPy",
    "figma": "Figma",
    "photoshop": "Photoshop",
    "illustrator": "Illustrator",
}


def extract_skills(text):
    """
    Extract known skills from CV text.
    """

    normalized = normalize_text(
        text
    ).lower()

    found_skills = set()

    for keyword, display_name in KNOWN_SKILLS.items():

        pattern = (
            r"(?<!\w)"
            + re.escape(keyword)
            + r"(?!\w)"
        )

        if re.search(
            pattern,
            normalized,
        ):
            found_skills.add(
                display_name
            )

    return sorted(
        found_skills
    )


SECTION_NAMES = {
    "education": [
        "education",
        "academic background",
        "academic history",
        "academic qualifications",
        "education & training",
    ],
    "experience": [
        "experience",
        "work experience",
        "employment history",
        "professional experience",
        "work history",
        "internships",
        "internship experience",
    ],
    "projects": [
        "projects",
        "personal projects",
        "academic projects",
        "selected projects",
        "key projects",
        "featured projects",
        "software projects",
        "project experience",
        "project work",
        "technical projects",
        "recent projects",
        "projects & portfolios",
        "project",
    ],
    "certifications": [
        "certifications",
        "certificates",
        "licenses",
        "certification",
        "licenses & certifications",
        "certifications & licenses",
    ],
    "languages": [
        "languages",
        "language skills",
        "spoken languages",
        "language",
    ],
    "skills": [
        "skills",
        "technical skills",
        "technologies",
        "skills & tools",
        "core competencies",
    ],
}


def detect_section(line):
    """
    Determine whether a line represents a known CV section header.
    Cleans leading numbering, markdown symbols, dashes, and matches
    against known section headings.
    """
    raw = line.strip()
    if not raw or len(raw) > 40:
        return None

    # Lines with commas or colons with trailing text are content/inline lists, NOT section headings
    # e.g., "Technologies: Python, React, SQL" or "Skills: Python, Django"
    if "," in raw:
        return None

    # If it has a colon with text after it, it's an inline key-value item, not a section heading
    if ":" in raw:
        parts = raw.split(":", 1)
        if parts[1].strip():
            return None

    cleaned = raw.lower()
    cleaned = re.sub(r'^[#*•\-\–\—\d\.\)\s\[\]_=]+', '', cleaned).strip()
    cleaned = cleaned.rstrip(": \t\r\n-_=")

    if not cleaned or len(cleaned) > 35:
        return None

    # 1. Exact match against SECTION_NAMES
    for section, names in SECTION_NAMES.items():
        if cleaned in names:
            return section

    # 2. Semantic matching on strictly short heading phrases
    words = cleaned.split()
    if len(words) <= 4:
        if "project" in cleaned:
            return "projects"
        if any(cleaned == k or cleaned.startswith(k) for k in ["education", "academic", "degrees", "qualifications"]):
            return "education"
        if any(cleaned == k or cleaned.startswith(k) for k in ["experience", "work history", "employment", "internships", "professional background"]):
            return "experience"
        if any(cleaned == k or cleaned.startswith(k) for k in ["certifications", "certificates", "licenses"]):
            return "certifications"
        if any(cleaned == k or cleaned.startswith(k) for k in ["languages", "language"]):
            return "languages"
        if any(cleaned == k or cleaned.startswith(k) for k in ["skills", "technical skills", "core skills", "tech stack", "competencies"]):
            return "skills"

    return None


def extract_sections(text):
    """
    Extract common sections from a CV.
    """

    lines = normalize_text(
        text
    ).splitlines()

    sections = {
        "education": [],
        "experience": [],
        "projects": [],
        "certifications": [],
        "languages": [],
        "skills": [],
    }

    current_section = None

    for line in lines:

        section = detect_section(
            line
        )

        if section:
            current_section = section
            continue

        if current_section:
            sections[
                current_section
            ].append(line.strip())

    return {
        key: "\n".join(value).strip()
        for key, value in sections.items()
    }


def extract_education(text):
    sections = extract_sections(
        text
    )

    return sections["education"]


def extract_experience(text):
    sections = extract_sections(
        text
    )

    return sections["experience"]


def extract_projects(text):
    sections = extract_sections(
        text
    )

    return sections["projects"]


def extract_certifications(text):
    sections = extract_sections(
        text
    )

    return sections[
        "certifications"
    ]


def parse_education(text):
    """Parse education text into structured format."""
    sections = extract_sections(text)
    education_text = sections["education"]

    if not education_text:
        return []

    # Simple parsing - split by lines and try to extract degree, institution, etc.
    lines = education_text.strip().split('\n')
    education_entries = []

    current_entry = {}
    for line in lines:
        line = line.strip()
        if not line:
            if current_entry:
                education_entries.append(current_entry)
                current_entry = {}
            continue

        # Try to identify degree, institution, field, years
        if any(keyword in line.lower() for keyword in ['bachelor', 'master', 'phd', 'bsc', 'msc', 'diploma']):
            current_entry['degree'] = line
        elif any(keyword in line.lower() for keyword in ['university', 'college', 'institute', 'school']):
            current_entry['institution'] = line
        elif any(keyword in line.lower() for keyword in ['computer', 'science', 'engineering', 'business', 'arts']):
            current_entry['field'] = line
        elif any(char.isdigit() for char in line):
            current_entry['years'] = line

    if current_entry:
        education_entries.append(current_entry)

    return education_entries


def parse_experience(text):
    """Parse experience text into structured format."""
    sections = extract_sections(text)
    experience_text = sections["experience"]

    if not experience_text:
        return []

    lines = experience_text.strip().split('\n')
    experience_entries = []

    current_entry = {}
    for line in lines:
        line = line.strip()
        if not line:
            if current_entry:
                experience_entries.append(current_entry)
                current_entry = {}
            continue

        # Try to identify title, company, description
        if any(keyword in line.lower() for keyword in ['developer', 'engineer', 'manager', 'intern', 'analyst']):
            current_entry['title'] = line
        elif any(keyword in line.lower() for keyword in ['at', 'inc', 'corp', 'ltd', 'company']):
            if 'title' in current_entry:
                current_entry['company'] = line
            else:
                current_entry['title'] = line
        else:
            if 'description' not in current_entry:
                current_entry['description'] = line
            else:
                current_entry['description'] += ' ' + line

    if current_entry:
        experience_entries.append(current_entry)

    return experience_entries


def parse_projects(text):
    """Parse projects text into structured format.

    Extracts ALL projects mentioned in the section or full text, regardless of formatting:
      - Bullet markers (`•`, `-`, `*`) or numbered items (`1.`, `2)`)
      - Distinct headings (e.g. `Hospital Management System`, `Project Name | React`)
      - Project prefixes (`Project 1:`, `Project #2 -`)
      - Multi-line descriptions and bulleted points
      - `Technologies:` / `Tech Stack:` / `Tools:` lines
    """
    sections = extract_sections(text)
    projects_text = sections.get("projects", "")

    if not projects_text or not projects_text.strip():
        # Fallback: search for a projects section in the raw text
        match = re.search(
            r'(?i)(?:projects?|personal projects?|academic projects?|selected projects?)[:\s\n]+(.*?)(?=\n\s*(?:education|experience|work history|skills|certifications|languages|$))',
            text,
            re.DOTALL,
        )
        if match:
            projects_text = match.group(1).strip()
        else:
            return []

    lines = [l.strip() for l in projects_text.splitlines() if l.strip()]

    bullet_re = re.compile(r"^[\u2022\-\*•\>\–\—]\s*")
    numbered_re = re.compile(
        r"^(?:\d+[\.\)]|(?:project|proj)\s*#?\d*[\:\.\-\)]?)\s*",
        re.IGNORECASE,
    )
    tech_header_re = re.compile(
        r"^\s*(technologies|tech stack|tools used|tools|stack|built with|built using|tech)\s*[:\-]?\s*",
        re.IGNORECASE,
    )
    proj_prefix_re = re.compile(
        r"^(?:project|proj)\s*#?\d*[\:\-\–\—\.]\s*",
        re.IGNORECASE,
    )

    known_techs = [
        "python", "django", "react", "javascript", "typescript", "java",
        "sql", "postgresql", "mysql", "sqlite", "mongodb", "redis", "docker",
        "kubernetes", "aws", "azure", "gcp", "git", "github", "html",
        "css", "node", "nodejs", "express", "flask", "fastapi", "spring",
        "springboot", "tensorflow", "pytorch", "pandas", "numpy", "figma",
        "next.js", "nextjs", "laravel", "c++", "c#", "php", "ruby", "rails",
        "graphql", "rest api", "rest", "tailwind", "redux", "flutter", "dart",
        "swift", "kotlin", "vue", "vue.js", "angular", "bootstrap", "sass",
        "ci/cd", "linux", "nlp", "opencv", "scikit-learn", "solidity", "web3",
        "firebase", "supabase", "webpack", "vite", "prisma", "jest",
    ]

    project_entries = []
    current_entry: dict = {}

    def extract_tech_from_text(txt: str) -> list[str]:
        found = []
        lower_txt = txt.lower()
        for tech in known_techs:
            pattern = r'\b' + re.escape(tech) + r'\b'
            if re.search(pattern, lower_txt):
                found.append(tech.title() if len(tech) > 4 else tech.upper())
        return found

    def flush_entry():
        nonlocal current_entry, project_entries
        if current_entry and current_entry.get("name"):
            name = proj_prefix_re.sub(
                "", current_entry["name"]).strip(" -—:|#*•\t")
            if name and len(name) >= 2:
                current_entry["name"] = name
                techs = current_entry.get("technologies", [])
                expanded = []
                for t in techs:
                    if isinstance(t, str):
                        for part in re.split(r"[,;|/]", t):
                            clean = tech_header_re.sub(
                                "", part).strip(" -—:|()[]")
                            if clean and clean.lower() not in [x.lower() for x in expanded]:
                                expanded.append(clean)

                desc = current_entry.get("description", "")
                if desc:
                    desc_techs = extract_tech_from_text(desc)
                    for dt in desc_techs:
                        if dt.lower() not in [x.lower() for x in expanded]:
                            expanded.append(dt)

                current_entry["technologies"] = expanded
                current_entry["description"] = current_entry.get(
                    "description", "").strip()
                project_entries.append(current_entry)
        current_entry = {}

    def is_action_or_sentence(line: str) -> bool:
        lower = line.lower()
        action_prefixes = [
            "developed ", "built ", "implemented ", "created ", "designed ",
            "worked on ", "worked with ", "responsible for ", "utilized ",
            "using ", "used ", "integrated ", "architected ", "engineered ",
            "collaborated ", "led ", "maintained ", "deployed ", "configured ",
            "managed ", "spearheaded ", "enhanced ", "improved ", "automated ",
            "and ", "with ", "to ", "for ", "by ", "in ", "from ", "the ",
            "this project ", "an application ", "a web application ",
            "a mobile app ", "a platform ", "a system ", "contributed to ",
            "assisted in ", "participated in ", "trained ", "researched ",
        ]
        return any(lower.startswith(prefix) for prefix in action_prefixes)

    for line in lines:
        is_numbered = bool(numbered_re.match(line))
        is_bullet = bool(bullet_re.match(line))

        if tech_header_re.match(line):
            tech_value = tech_header_re.sub("", line).strip()
            if current_entry:
                current_entry.setdefault("technologies", []).append(tech_value)
            continue

        if is_numbered:
            flush_entry()
            stripped = numbered_re.sub("", line).strip()
            if " - " in stripped and len(stripped.split(" - ")[0]) <= 60:
                name_part, desc_part = stripped.split(" - ", 1)
                current_entry["name"] = name_part.strip()
                current_entry["description"] = desc_part.strip()
            elif ": " in stripped and not tech_header_re.match(stripped) and len(stripped.split(": ")[0]) <= 60:
                name_part, desc_part = stripped.split(": ", 1)
                current_entry["name"] = name_part.strip()
                current_entry["description"] = desc_part.strip()
            elif " | " in stripped:
                name_part, tech_part = stripped.split(" | ", 1)
                current_entry["name"] = name_part.strip()
                current_entry.setdefault(
                    "technologies", []).append(tech_part.strip())
            else:
                current_entry["name"] = stripped
            continue

        if not is_bullet and (" | " in line or " — " in line):
            sep = " | " if " | " in line else " — "
            left, right = line.split(sep, 1)
            if len(left.strip()) <= 60 and not is_action_or_sentence(left.strip()):
                flush_entry()
                current_entry["name"] = left.strip()
                current_entry.setdefault(
                    "technologies", []).append(right.strip())
                continue

        if is_bullet:
            stripped = bullet_re.sub("", line).strip()
            if (" - " in stripped and len(stripped.split(" - ")[0]) <= 50 and not is_action_or_sentence(stripped.split(" - ")[0])) or \
               (": " in stripped and len(stripped.split(": ")[0]) <= 50 and not is_action_or_sentence(stripped.split(": ")[0])):
                sep = " - " if " - " in stripped else ": "
                name_part, desc_part = stripped.split(sep, 1)
                flush_entry()
                current_entry["name"] = name_part.strip()
                current_entry["description"] = desc_part.strip()
            elif not current_entry:
                current_entry["name"] = stripped
            else:
                if not current_entry.get("description"):
                    current_entry["description"] = stripped
                else:
                    current_entry["description"] += "\n• " + stripped
            continue

        if not current_entry:
            current_entry["name"] = line
        else:
            words = line.split()
            looks_like_heading = (
                len(line) <= 65
                and len(words) <= 9
                and not is_action_or_sentence(line)
                and not line.endswith(".")
                and not tech_header_re.match(line)
            )

            if looks_like_heading and (current_entry.get("description") or current_entry.get("technologies")):
                flush_entry()
                current_entry["name"] = line
            else:
                if not current_entry.get("description"):
                    current_entry["description"] = line
                else:
                    current_entry["description"] += " " + line

    flush_entry()
    return project_entries


def parse_certifications(text):
    """Parse certifications text into structured objects.

    Each entry is returned as a dict with the following keys (any may be
    absent): ``name``, ``issuer``, ``date``.

    Splits on lines, bullets, and semicolons. Tries to detect a trailing
    issuer (" - AWS", " — Google") and a year/month token (date).
    """
    sections = extract_sections(text)
    certifications_text = sections["certifications"]

    if not certifications_text:
        return []

    raw_lines = certifications_text.strip().split("\n")
    entries: list[dict] = []

    for raw in raw_lines:
        line = raw.strip()
        if not line:
            continue

        # Strip bullets / numbering from the leading line
        line = re.sub(r"^[\u2022\-\*•]\s+", "", line)
        line = re.sub(r"^\d+[\.\)]\s+", "", line)

        # Allow multiple certifications separated by `;` or `,` on a single
        # line, but be careful: don't split inside a "Name - Issuer" pair.
        chunks = [line]
        if ";" in line:
            chunks = [c.strip() for c in line.split(";") if c.strip()]

        for chunk in chunks:
            name = chunk
            issuer = None
            date = None

            # Split "Name - Issuer (Date)" / "Name — Issuer" / "Name | Issuer"
            for sep in [" - ", " — ", " | "]:
                if sep in chunk:
                    left, right = chunk.split(sep, 1)
                    name = left.strip()
                    tail = right.strip()
                    # Extract trailing date in parentheses if present
                    date_match = re.search(r"\(([^)]+)\)\s*$", tail)
                    if date_match:
                        date = date_match.group(1).strip()
                        tail = tail[: date_match.start()].strip(" -—|")
                    if tail:
                        issuer = tail
                    break

            # If no separator, try to find a trailing year/month
            if date is None:
                date_match = re.search(
                    r"\b((?:19|20)\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|"
                    r"Sep|Oct|Nov|Dec)[^\)]*\)",
                    chunk,
                )
                if date_match:
                    date = date_match.group(0).strip("()")
                    name = (chunk[: date_match.start()] +
                            chunk[date_match.end():]).strip(" -—|,")

            entries.append({
                "name": name or None,
                "issuer": issuer,
                "date": date,
            })

    return entries


def parse_languages(text):
    """Parse languages text into a list of dicts with proficiency levels.

    Recognises patterns like::

        English - Fluent
        Amharic (Native)
        Spanish — Conversational

    Returns a list of ``{"name": str, "proficiency": str|None}`` dicts.
    """
    sections = extract_sections(text)
    languages_text = sections["languages"]

    if not languages_text:
        return []

    raw_lines = languages_text.strip().split("\n")
    entries: list[dict] = []

    proficiency_levels = (
        "native",
        "fluent",
        "advanced",
        "proficient",
        "professional",
        "conversational",
        "intermediate",
        "basic",
        "beginner",
        "elementary",
        "limited working",
        "limited",
    )

    for raw in raw_lines:
        line = raw.strip()
        if not line:
            continue

        # Strip bullets / numbering from the leading line
        line = re.sub(r"^[\u2022\-\*•]\s+", "", line)
        line = re.sub(r"^\d+[\.\)]\s+", "", line)

        # Allow `;` separators
        chunks = [line]
        if ";" in line:
            chunks = [c.strip() for c in line.split(";") if c.strip()]

        for chunk in chunks:
            name = chunk
            proficiency = None

            # Split "Name - Proficiency" / "Name (Proficiency)" / "Name — Proficiency"
            for sep in [" - ", " — ", " | "]:
                if sep in chunk:
                    left, right = chunk.split(sep, 1)
                    name = left.strip()
                    proficiency = right.strip() or None
                    break
            else:
                paren_match = re.search(r"\(([^)]+)\)\s*$", chunk)
                if paren_match:
                    proficiency = paren_match.group(1).strip() or None
                    name = (chunk[: paren_match.start()] +
                            chunk[paren_match.end():]).strip(" -—|,")

            if proficiency:
                proficiency_lower = proficiency.lower()
                matched = next(
                    (
                        level
                        for level in proficiency_levels
                        if level in proficiency_lower
                    ),
                    None,
                )
                if matched:
                    proficiency = matched.title()

            entries.append({
                "name": name.strip(),
                "proficiency": proficiency,
            })

    return entries


def calculate_experience_years(experience_entries):
    """
    Calculate total years of experience from parsed experience entries.

    Phase 6 Task 6.1 — Extracts duration information from experience entries
    and sums them to estimate total professional experience in years.
    """
    import re

    total_years = 0.0

    for entry in experience_entries:
        if not isinstance(entry, dict):
            continue

        # Look for duration patterns in the entry's description or years field
        text = ""
        if 'description' in entry:
            text += str(entry['description']) + " "
        if 'years' in entry:
            text += str(entry['years']) + " "

        # Pattern for "X years" or "X months"
        year_match = re.search(r'(\d+(?:\.\d+)?)\s*years?', text.lower())
        month_match = re.search(r'(\d+)\s*months?', text.lower())

        if year_match:
            total_years += float(year_match.group(1))
        elif month_match:
            total_years += float(month_match.group(1)) / 12

    return round(total_years, 1)


def analyze_cv(text):
    """
    Analyze CV text and return structured data.

    Phase 6 Task 6.1 — Added experience_years calculation to output contract.
    Phase 7 — Projects extract ALL projects (not only first) and certifications
    are now structured objects; languages are extracted as their own section.
    """

    text = normalize_text(text)

    if not text:
        return {
            "skills": [],
            "education": [],
            "experience": [],
            "projects": [],
            "certifications": [],
            "languages": [],
            "experience_years": 0.0,
        }

    experience_entries = parse_experience(text)

    return {
        "skills": extract_skills(text),
        "education": parse_education(text),
        "experience": experience_entries,
        "projects": parse_projects(text),
        "certifications": parse_certifications(text),
        "languages": parse_languages(text),
        "experience_years": calculate_experience_years(experience_entries),
    }
