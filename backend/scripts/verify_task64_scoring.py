"""
Phase 6 Task 6.4 — Scoring Functions Verification

Tests the individual component score functions (Sections 3.11.4–3.11.7):
  - education_score: field_of_study/education_level alignment
  - experience_score: bucket comparison
  - interest_score: StudentInterest overlap
  - location_score: country/city match with remote override
  - work_mode_score: exact match

Check: One unit test per function per bullet in Sections 3.11.4–3.11.7
(reuse the doc's own examples, e.g. Computer Science student → Software Engineering internship = high education_score).
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.scoring import (
    education_score,
    experience_score,
    interest_score,
    location_score,
    work_mode_score,
)


def check(description, condition):
    """Helper tocheck a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_scoring_functions():
    """Test all scoring functions with business spec examples."""
    print("=" * 80)
    print("PHASE 6 TASK 6.4 — SCORING FUNCTIONS VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Section 3.11.4 — Education Score
    print("\n1. Testing education_score (Section 3.11.4)...")
    print("-" * 80)

    # Computer Science student → Software Engineering internship (related fields)
    score = education_score(
        student_field_of_study="Computer Science",
        student_education_level="bachelor",
        internship_field_of_study="Software Engineering",
        internship_education_level="bachelor"
    )
    checks_total += 1
    if check("CS → Software Engineering = high score (>0.7)", score > 0.7):
        checks_passed += 1
    print(f"  CS → Software Engineering: {score:.2f}")

    # Exact field match
    score = education_score(
        student_field_of_study="Computer Science",
        student_education_level="master",
        internship_field_of_study="Computer Science",
        internship_education_level="bachelor"
    )
    checks_total += 1
    if check("Exact field match + higher level = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Exact match (master → bachelor): {score:.2f}")

    # Synonym handling (CS → Computer Science)
    score = education_score(
        student_field_of_study="CS",
        student_education_level="bachelor",
        internship_field_of_study="Computer Science",
        internship_education_level="bachelor"
    )
    checks_total += 1
    if check("Synonym CS → Computer Science = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Synonym CS → Computer Science: {score:.2f}")

    # Level mismatch (bachelor → master requirement)
    score = education_score(
        student_field_of_study="Computer Science",
        student_education_level="bachelor",
        internship_field_of_study="Computer Science",
        internship_education_level="master"
    )
    checks_total += 1
    if check("Level below requirement = reduced score (<1.0)", score < 1.0):
        checks_passed += 1
    print(f"  Bachelor → Master requirement: {score:.2f}")

    # No field requirement
    score = education_score(
        student_field_of_study="Computer Science",
        student_education_level="bachelor",
        internship_field_of_study=None,
        internship_education_level=None
    )
    checks_total += 1
    if check("No field requirement = neutral 0.5", score == 0.5):
        checks_passed += 1
    print(f"  No field requirement: {score:.2f}")

    # Section 3.11.5 — Experience Score
    print("\n2. Testing experience_score (Section 3.11.5)...")
    print("-" * 80)

    # Beginner → entry-level (good match)
    score = experience_score(
        student_experience_level="beginner",
        internship_experience_level="entry_level",
        student_experience_years=0.0
    )
    checks_total += 1
    if check("Beginner → entry-level = high score (>0.7)", score > 0.7):
        checks_passed += 1
    print(f"  Beginner → entry-level: {score:.2f}")

    # Beginner → senior-only (low score)
    score = experience_score(
        student_experience_level="beginner",
        internship_experience_level="senior",
        student_experience_years=0.0
    )
    checks_total += 1
    if check("Beginner → senior = low score (<0.5)", score < 0.5):
        checks_passed += 1
    print(f"  Beginner → senior: {score:.2f}")

    # Intermediate → intermediate (exact match)
    score = experience_score(
        student_experience_level="intermediate",
        internship_experience_level="intermediate",
        student_experience_years=2.0
    )
    checks_total += 1
    if check("Intermediate → intermediate = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Intermediate → intermediate: {score:.2f}")

    # Senior → entry-level (exceeds requirement)
    score = experience_score(
        student_experience_level="senior",
        internship_experience_level="entry_level",
        student_experience_years=5.0
    )
    checks_total += 1
    if check("Senior → entry-level = 1.0 (exceeds)", score == 1.0):
        checks_passed += 1
    print(f"  Senior → entry-level: {score:.2f}")

    # Experience years boost
    score = experience_score(
        student_experience_level="beginner",
        internship_experience_level="intermediate",
        student_experience_years=3.0
    )
    checks_total += 1
    if check("3 years experience boosts score", score > 0.5):
        checks_passed += 1
    print(f"  Beginner → intermediate with 3 years: {score:.2f}")

    # Section 3.11.6 — Interest Score
    print("\n3. Testing interest_score (Section 3.11.6)...")
    print("-" * 80)

    # Exact match
    score = interest_score(
        student_interests=["Software Development"],
        internship_category="Software Development",
        use_semantic=False
    )
    checks_total += 1
    if check("Exact interest match = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Exact match: {score:.2f}")

    # No match
    score = interest_score(
        student_interests=["Graphic Design"],
        internship_category="Software Development",
        use_semantic=False
    )
    checks_total += 1
    if check("No interest match = 0.0", score == 0.0):
        checks_passed += 1
    print(f"  No match: {score:.2f}")

    # Multiple interests, one matches
    score = interest_score(
        student_interests=["Software Development", "Data Science", "Machine Learning"],
        internship_category="Data Science",
        use_semantic=False
    )
    checks_total += 1
    if check("One of multiple interests matches = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Multiple interests, one match: {score:.2f}")

    # Empty interests
    score = interest_score(
        student_interests=[],
        internship_category="Software Development",
        use_semantic=False
    )
    checks_total += 1
    if check("Empty interests = 0.0", score == 0.0):
        checks_passed += 1
    print(f"  Empty interests: {score:.2f}")

    # Section 3.11.7 — Location Score
    print("\n4. Testing location_score (Section 3.11.7)...")
    print("-" * 80)

    # Exact city match
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="USA",
        internship_city="New York"
    )
    checks_total += 1
    if check("Exact city match = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Exact city match: {score:.2f}")

    # Same country, different city
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="USA",
        internship_city="San Francisco"
    )
    checks_total += 1
    if check("Same country, different city = 0.5", score == 0.5):
        checks_passed += 1
    print(f"  Same country, different city: {score:.2f}")

    # Remote internship
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="UK",
        internship_city="London",
        internship_type="remote"
    )
    checks_total += 1
    if check("Remote internship = 1.0 (location irrelevant)", score == 1.0):
        checks_passed += 1
    print(f"  Remote internship: {score:.2f}")

    # Willing to relocate
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="UK",
        internship_city="London",
        student_willing_to_relocate=True
    )
    checks_total += 1
    if check("Willing to relocate = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Willing to relocate: {score:.2f}")

    # Preferred location match
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="USA",
        internship_city="San Francisco",
        student_preferred_locations=["San Francisco", "Los Angeles"]
    )
    checks_total += 1
    if check("Preferred location match = 0.75", score == 0.75):
        checks_passed += 1
    print(f"  Preferred location match: {score:.2f}")

    # No match
    score = location_score(
        student_country="USA",
        student_city="New York",
        internship_country="UK",
        internship_city="London"
    )
    checks_total += 1
    if check("No location match = 0.0", score == 0.0):
        checks_passed += 1
    print(f"  No match: {score:.2f}")

    # Section 3.11.7 — Work Mode Score
    print("\n5. Testing work_mode_score (Section 3.11.7)...")
    print("-" * 80)

    # Exact match
    score = work_mode_score(
        student_work_mode="remote",
        internship_work_mode="remote"
    )
    checks_total += 1
    if check("Exact work mode match = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Remote → Remote: {score:.2f}")

    # Hybrid match
    score = work_mode_score(
        student_work_mode="hybrid",
        internship_work_mode="hybrid"
    )
    checks_total += 1
    if check("Hybrid match = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Hybrid → Hybrid: {score:.2f}")

    # On-site match
    score = work_mode_score(
        student_work_mode="onsite",
        internship_work_mode="onsite"
    )
    checks_total += 1
    if check("On-site match = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  On-site → On-site: {score:.2f}")

    # Student flexible (any)
    score = work_mode_score(
        student_work_mode="any",
        internship_work_mode="remote"
    )
    checks_total += 1
    if check("Student flexible (any) = 1.0", score == 1.0):
        checks_passed += 1
    print(f"  Any → Remote: {score:.2f}")

    # Mismatch
    score = work_mode_score(
        student_work_mode="remote",
        internship_work_mode="onsite"
    )
    checks_total += 1
    if check("Work mode mismatch = 0.0", score == 0.0):
        checks_passed += 1
    print(f"  Remote → On-site: {score:.2f}")

    # Empty inputs
    score = work_mode_score(
        student_work_mode="",
        internship_work_mode="remote"
    )
    checks_total += 1
    if check("Empty student preference = 0.5", score == 0.5):
        checks_passed += 1
    print(f"  Empty → Remote: {score:.2f}")

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.4: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_scoring_functions())
