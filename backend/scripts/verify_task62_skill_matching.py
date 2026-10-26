"""
Phase 6 Task 6.2 — Skill Matching Verification

Tests the skill matching module's ability to:
1. Compute overlap ratio between student skills and internship required skills
2. Return exact-match component score (0.0–1.0)
3. Handle the Section 3.11.3 example: Student {Python, Django, REST API} vs
   internship requiring {Python, Django, Backend Development} → 2/3 overlap

Check: The overlap ratio should be |intersection| / |required| = 2/3 ≈ 0.667
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.skill_matching import exact_skill_score, get_matched_skills


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_skill_matching():
    """Test the skill matching module with Section 3.11.3 example."""
    print("=" * 80)
    print("PHASE 6 TASK 6.2 — SKILL MATCHING VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Section 3.11.3 example
    print("\n1. Testing Section 3.11.3 example...")
    print("-" * 80)

    student_skills = ["Python", "Django", "REST API"]
    internship_skills = ["Python", "Django", "Backend Development"]

    score = exact_skill_score(student_skills, internship_skills)

    checks_total += 1
    if check("exact_skill_score returns a number", isinstance(score, (int, float))):
        checks_passed += 1

    checks_total += 1
    if check("Score is between 0.0 and 1.0", 0.0 <= score <= 1.0):
        checks_passed += 1

    # Expected: 2/3 ≈ 0.667
    expected_score = 2.0 / 3.0
    checks_total += 1
    if check(f"Score is approximately 2/3 ({expected_score:.3f})", 
             abs(score - expected_score) < 0.01):
        checks_passed += 1

    print(f"  Student skills: {student_skills}")
    print(f"  Internship skills: {internship_skills}")
    print(f"  Overlap: {set(s.lower() for s in student_skills) & set(s.lower() for s in internship_skills)}")
    print(f"  Score: {score:.3f} (expected: {expected_score:.3f})")

    # Test get_matched_skills
    print("\n2. Testing get_matched_skills...")
    print("-" * 80)

    matched = get_matched_skills(student_skills, internship_skills)

    checks_total += 1
    if check("get_matched_skills returns a list", isinstance(matched, list)):
        checks_passed += 1

    checks_total += 1
    if check("Matched skills include Python", "Python" in matched):
        checks_passed += 1

    checks_total += 1
    if check("Matched skills include Django", "Django" in matched):
        checks_passed += 1

    checks_total += 1
    if check("Matched skills do NOT include Backend Development", "Backend Development" not in matched):
        checks_passed += 1

    checks_total += 1
    if check("Matched skills count is 2", len(matched) == 2):
        checks_passed += 1

    print(f"  Matched skills: {matched}")

    # Test edge cases
    print("\n3. Testing edge cases...")
    print("-" * 80)

    # Empty internship skills → neutral score
    empty_score = exact_skill_score(student_skills, [])
    checks_total += 1
    if check("Empty internship skills returns neutral 0.5", empty_score == 0.5):
        checks_passed += 1

    # Empty student skills → 0.0 score
    empty_student_score = exact_skill_score([], internship_skills)
    checks_total += 1
    if check("Empty student skills returns 0.0", empty_student_score == 0.0):
        checks_passed += 1

    # Perfect match → 1.0 score
    perfect_score = exact_skill_score(student_skills, student_skills)
    checks_total += 1
    if check("Perfect match returns 1.0", perfect_score == 1.0):
        checks_passed += 1

    # No match → 0.0 score
    no_match_score = exact_skill_score(["Python", "Django"], ["Java", "Spring"])
    checks_total += 1
    if check("No match returns 0.0", no_match_score == 0.0):
        checks_passed += 1

    # Case insensitivity
    case_insensitive_score = exact_skill_score(
        ["python", "django", "rest api"],
        ["Python", "Django", "Backend Development"]
    )
    checks_total += 1
    if check("Case insensitive matching works", case_insensitive_score == expected_score):
        checks_passed += 1

    # Whitespace handling
    whitespace_score = exact_skill_score(
        [" Python ", "  Django  ", "REST API"],
        ["Python", "Django", "Backend Development"]
    )
    checks_total += 1
    if check("Whitespace trimming works", whitespace_score == expected_score):
        checks_passed += 1

    # Test with different overlap ratios
    print("\n4. Testing different overlap ratios...")
    print("-" * 80)

    # 1/4 overlap
    score_1_4 = exact_skill_score(["Python"], ["Python", "Django", "REST API", "Java"])
    checks_total += 1
    if check("1/4 overlap returns 0.25", abs(score_1_4 - 0.25) < 0.01):
        checks_passed += 1

    # 3/4 overlap
    score_3_4 = exact_skill_score(
        ["Python", "Django", "REST API"],
        ["Python", "Django", "REST API", "Java"]
    )
    checks_total += 1
    if check("3/4 overlap returns 0.75", abs(score_3_4 - 0.75) < 0.01):
        checks_passed += 1

    # 1/1 overlap (single skill)
    score_1_1 = exact_skill_score(["Python"], ["Python"])
    checks_total += 1
    if check("1/1 overlap returns 1.0", score_1_1 == 1.0):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.2: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_skill_matching())
