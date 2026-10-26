"""
Phase 6 Task 6.1 — Resume Parser Verification

Tests the resume parser's ability to:
1. Extract raw text from PDF/DOCX files
2. Use spaCy NER for entity extraction
3. Use section-based heuristics for parsing
4. Match skills against the Skill catalogue
5. Calculate experience_years from parsed experience
6. Return the correct output contract: {skills, certifications, projects, experience_years}

Check: Feed sample resumes and assert extracted skills include obviously-stated ones
(e.g., a resume that says "Developed web applications using Python and Django" must
yield Python and Django — this is the exact example in Section 4.5).
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.resume_parser import parse_cv
from ai_engine.models import ParsedCV


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_resume_parser():
    """Test the resume parser with sample resume text."""
    print("=" * 80)
    print("PHASE 6 TASK 6.1 — RESUME PARSER VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Sample resume text with clearly stated skills
    # This is the exact example from Section 4.5
    sample_resume = """
    John Doe
    Software Engineer

    Experience
    Senior Developer at Tech Corp
    Developed web applications using Python and Django.
    Built REST APIs with FastAPI and integrated PostgreSQL databases.
    Worked with Docker and Kubernetes for containerization.
    3 years experience

    Junior Developer at Startup Inc
    Created frontend applications with React and TypeScript.
    Used Git for version control and GitHub for collaboration.
    2 years experience

    Skills
    Python, Django, FastAPI, PostgreSQL, Docker, Kubernetes, React, TypeScript, Git, GitHub

    Projects
    E-commerce Platform - Built with Django and React
    Blog API - REST API using FastAPI

    Certifications
    AWS Certified Developer
    Google Cloud Professional

    Education
    Bachelor of Computer Science
    University of Technology
    """

    print("\n1. Testing resume parser with sample resume...")
    print("-" * 80)

    # Parse the resume
    parsed = parse_cv(sample_resume)

    # Check output contract
    checks_total += 1
    if check("Output is ParsedCV instance", isinstance(parsed, ParsedCV)):
        checks_passed += 1

    checks_total += 1
    if check("ParsedCV has skills field", hasattr(parsed, "skills")):
        checks_passed += 1

    checks_total += 1
    if check("ParsedCV has certifications field", hasattr(parsed, "certifications")):
        checks_passed += 1

    checks_total += 1
    if check("ParsedCV has projects field", hasattr(parsed, "projects")):
        checks_passed += 1

    checks_total += 1
    if check("ParsedCV has experience_years field", hasattr(parsed, "experience_years")):
        checks_passed += 1

    # Check skill extraction - the critical test from Section 4.5
    print("\n2. Testing skill extraction (Section 4.5 example)...")
    print("-" * 80)

    checks_total += 1
    if check("Python extracted from resume", "Python" in parsed.skills):
        checks_passed += 1

    checks_total += 1
    if check("Django extracted from resume", "Django" in parsed.skills):
        checks_passed += 1

    checks_total += 1
    if check("FastAPI extracted from resume", "FastAPI" in parsed.skills):
        checks_passed += 1

    checks_total += 1
    if check("PostgreSQL extracted from resume", "PostgreSQL" in parsed.skills):
        checks_passed += 1

    checks_total += 1
    if check("React extracted from resume", "React" in parsed.skills):
        checks_passed += 1

    checks_total += 1
    if check("TypeScript extracted from resume", "TypeScript" in parsed.skills):
        checks_passed += 1

    # Check other fields
    print("\n3. Testing other extracted fields...")
    print("-" * 80)

    checks_total += 1
    if check("Certifications extracted", len(parsed.certifications) > 0):
        checks_passed += 1

    checks_total += 1
    if check("Projects extracted", len(parsed.projects) > 0):
        checks_passed += 1

    checks_total += 1
    if check("Experience extracted", len(parsed.experience) > 0):
        checks_passed += 1

    # Check experience_years calculation
    print("\n4. Testing experience_years calculation...")
    print("-" * 80)

    checks_total += 1
    if check("experience_years is a number", isinstance(parsed.experience_years, (int, float))):
        checks_passed += 1

    checks_total += 1
    if check("experience_years is non-negative", parsed.experience_years >= 0):
        checks_passed += 1

    # The sample has "3 years" and "2 years" = 5 years total
    checks_total += 1
    if check("experience_years approximately correct (5 years)", 
             abs(parsed.experience_years - 5.0) < 1.0):
        checks_passed += 1

    # Test with empty resume
    print("\n5. Testing with empty resume...")
    print("-" * 80)

    empty_parsed = parse_cv("")

    checks_total += 1
    if check("Empty resume returns empty skills", len(empty_parsed.skills) == 0):
        checks_passed += 1

    checks_total += 1
    if check("Empty resume returns experience_years = 0", empty_parsed.experience_years == 0.0):
        checks_passed += 1

    # Test with resume missing some sections
    print("\n6. Testing with resume missing sections...")
    print("-" * 80)

    minimal_resume = """
    Skills
    Python, JavaScript, SQL
    """

    minimal_parsed = parse_cv(minimal_resume)

    checks_total += 1
    if check("Minimal resume extracts skills", len(minimal_parsed.skills) > 0):
        checks_passed += 1

    checks_total += 1
    if check("Python extracted from minimal resume", "Python" in minimal_parsed.skills):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.1: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_resume_parser())
