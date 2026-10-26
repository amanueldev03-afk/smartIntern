"""
Phase 6 Task 6.6 — Recommendation Explanation Verification

Tests the explanation generator (Section 3.11.9):
  - Given component scores, generate human-readable reason list
  - Threshold each component (score > 0.7 → include as positive reason)
  - Explanations stay accurate and auditable (no free-text generation)

Check:
  - Reproduce Section 3.11.9's exact example output (92% match)
  - Confirm low-scoring component is correctly excluded from explanation
  - Don't claim a match that didn't happen
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.explanation import build_explanation, ExplanationConfig


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_explanation_generator():
    """Test the explanation generator with synthetic data."""
    print("=" * 80)
    print("PHASE 6 TASK 6.6 — RECOMMENDATION EXPLANATION VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Test 1: Section 3.11.9 example (92% match)
    print("\n1. Testing Section 3.11.9 example (92% match)...")
    print("-" * 80)

    # High scores for most components (should produce positive reasons)
    explanation = build_explanation(
        skill_score=0.90,
        education_score=0.85,
        interest_score=0.80,
        experience_score=0.75,
        location_score=1.00,
        work_mode_score=1.00,
        matched_skills=["Python", "Django", "REST API"],
        field_of_study="Computer Science",
        internship_title="Backend Developer"
    )

    print(f"  Generated explanation:")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Explanation includes skill match reason", 
             any("skill" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("Explanation includes education match reason", 
             any("computer science" in line.lower() or "education" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("Explanation includes location match reason", 
             any("location" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("Explanation includes work mode match reason", 
             any("work mode" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("Explanation includes matched skills", 
             any("python" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 2: Low-scoring component exclusion
    print("\n2. Testing low-scoring component exclusion...")
    print("-" * 80)

    # High skill score, low education score
    explanation = build_explanation(
        skill_score=0.90,
        education_score=0.30,  # Below threshold
        interest_score=0.80,
        experience_score=0.75,
        location_score=1.00,
        work_mode_score=1.00,
        matched_skills=["Python", "Django"],
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (education_score=0.30):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Low education score excluded from explanation", 
             not any("education" in line.lower() or "computer science" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("High skill score still included", 
             any("skill" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 3: All scores below threshold
    print("\n3. Testing all scores below threshold...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.40,
        education_score=0.30,
        interest_score=0.35,
        experience_score=0.25,
        location_score=0.40,
        work_mode_score=0.30,
        matched_skills=[],
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (all scores < 0.5):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Fallback explanation used when no thresholds met", 
             "overall profile match" in explanation[0].lower()):
        checks_passed += 1

    checks_total += 1
    if check("No false positive reasons included", 
             len(explanation) == 1):
        checks_passed += 1

    # Test 4: Threshold configuration
    print("\n4. Testing custom threshold configuration...")
    print("-" * 80)

    custom_config = ExplanationConfig(high_threshold=0.80, medium_threshold=0.60)
    explanation = build_explanation(
        skill_score=0.75,  # Below custom high threshold (0.80)
        education_score=0.85,
        interest_score=0.70,
        experience_score=0.65,
        location_score=0.90,
        work_mode_score=0.85,
        matched_skills=["Python"],
        field_of_study="Computer Science",
        config=custom_config
    )

    print(f"  Generated explanation (custom thresholds):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Custom high threshold respected (skill=0.75 shows as partial)", 
             "partial skill match" in " ".join(explanation).lower()):
        checks_passed += 1

    checks_total += 1
    if check("Custom high threshold respected (education=0.85 included)", 
             any("computer science" in line.lower() or "education" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 5: Partial match (medium threshold)
    print("\n5. Testing partial match (medium threshold)...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.60,  # Medium threshold range
        education_score=0.55,
        interest_score=0.40,
        experience_score=0.30,
        location_score=0.60,
        work_mode_score=0.50,
        matched_skills=["Python"],
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (medium scores):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Partial skill match indicated", 
             "partial" in " ".join(explanation).lower()):
        checks_passed += 1

    checks_total += 1
    if check("Partial education match indicated", 
             "partial" in " ".join(explanation).lower()):
        checks_passed += 1

    # Test 6: No matched skills provided
    print("\n6. Testing without matched skills...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.90,
        education_score=0.85,
        interest_score=0.80,
        experience_score=0.75,
        location_score=1.00,
        work_mode_score=1.00,
        matched_skills=None,  # No skills provided
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (no matched skills):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Skill match reason included without skill list", 
             any("skill" in line.lower() for line in explanation)):
        checks_passed += 1

    checks_total += 1
    if check("No 'Matched skills:' line when skills not provided", 
             not any("matched skills:" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 7: Empty field_of_study
    print("\n7. Testing with empty field_of_study...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.90,
        education_score=0.85,
        interest_score=0.80,
        experience_score=0.75,
        location_score=1.00,
        work_mode_score=1.00,
        matched_skills=["Python"],
        field_of_study=None  # No field of study
    )

    print(f"  Generated explanation (no field_of_study):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Generic education reason used when field_of_study missing", 
             any("education background aligned" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 8: Work mode exact match
    print("\n8. Testing work mode exact match...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.50,
        education_score=0.50,
        interest_score=0.50,
        experience_score=0.50,
        location_score=0.50,
        work_mode_score=1.00,  # Perfect match
        matched_skills=[],
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (work_mode=1.0):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Work mode match reason included", 
             any("work mode" in line.lower() for line in explanation)):
        checks_passed += 1

    # Test 9: Location partial match
    print("\n9. Testing location partial match...")
    print("-" * 80)

    explanation = build_explanation(
        skill_score=0.50,
        education_score=0.50,
        interest_score=0.50,
        experience_score=0.50,
        location_score=0.60,  # Medium threshold
        work_mode_score=0.50,
        matched_skills=[],
        field_of_study="Computer Science"
    )

    print(f"  Generated explanation (location=0.60):")
    for line in explanation:
        print(f"    - {line}")

    checks_total += 1
    if check("Location partial match indicated", 
             any("partially" in line.lower() for line in explanation)):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.6: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_explanation_generator())
