"""
Phase 6 Task 6.5 — Weighted Ranking Algorithm Verification

Tests the weighted scoring algorithm (Section 3.11.8, Table 3.1):
  - overall = 0.40*skill_score + 0.20*education_score + 0.15*interest_score
            + 0.10*experience_score + 0.10*location_score + 0.05*work_mode_score

Check:
  - Feed a synthetic student+internship pair with hand-computed expected weighted sum
  - Assert the function matches within floating-point tolerance
  - Confirm weights sum to 1.0
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.ranking.scorer import (
    ComponentScores,
    calculate_overall_score,
    validate_weights,
    get_weights,
    WEIGHTS,
)


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_weighted_ranking():
    """Test the weighted ranking algorithm with synthetic data."""
    print("=" * 80)
    print("PHASE 6 TASK 6.5 — WEIGHTED RANKING ALGORITHM VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Test 1: Weights sum to 1.0
    print("\n1. Testing weights sum to 1.0...")
    print("-" * 80)

    checks_total += 1
    if check("validate_weights() returns True", validate_weights()):
        checks_passed += 1

    total = sum(WEIGHTS.values())
    print(f"  Total weight sum: {total:.6f}")
    
    checks_total += 1
    if check("Weights sum to 1.0 (within tolerance)", abs(total - 1.0) < 0.0001):
        checks_passed += 1

    # Print individual weights
    print("\n  Individual weights:")
    for component, weight in WEIGHTS.items():
        print(f"    {component}: {weight:.2f}")

    # Test 2: Synthetic student+internship pair with hand-computed expected sum
    print("\n2. Testing synthetic student+internship pair...")
    print("-" * 80)

    # Synthetic scores (all 0.0–1.0)
    skill = 0.80      # 80% skill match
    education = 0.90  # 90% education match
    interest = 0.70  # 70% interest match
    experience = 0.60 # 60% experience match
    location = 1.00   # 100% location match
    work_mode = 1.00  # 100% work mode match

    scores = ComponentScores(
        skill_score=skill,
        education_score=education,
        interest_score=interest,
        experience_score=experience,
        location_score=location,
        work_mode_score=work_mode,
    )

    # Hand-computed expected score:
    # overall = 0.40*0.80 + 0.20*0.90 + 0.15*0.70 + 0.10*0.60 + 0.10*1.00 + 0.05*1.00
    #         = 0.32 + 0.18 + 0.105 + 0.06 + 0.10 + 0.05
    #         = 0.815
    #         = 81.5 (scaled to 0–100)
    expected_raw = (
        skill * WEIGHTS["skill_score"]
        + education * WEIGHTS["education_score"]
        + interest * WEIGHTS["interest_score"]
        + experience * WEIGHTS["experience_score"]
        + location * WEIGHTS["location_score"]
        + work_mode * WEIGHTS["work_mode_score"]
    )
    expected_score = round(expected_raw * 100, 2)

    actual_score = calculate_overall_score(scores)

    print(f"  Component scores:")
    print(f"    skill_score: {skill:.2f} (weight: {WEIGHTS['skill_score']:.2f})")
    print(f"    education_score: {education:.2f} (weight: {WEIGHTS['education_score']:.2f})")
    print(f"    interest_score: {interest:.2f} (weight: {WEIGHTS['interest_score']:.2f})")
    print(f"    experience_score: {experience:.2f} (weight: {WEIGHTS['experience_score']:.2f})")
    print(f"    location_score: {location:.2f} (weight: {WEIGHTS['location_score']:.2f})")
    print(f"    work_mode_score: {work_mode:.2f} (weight: {WEIGHTS['work_mode_score']:.2f})")
    print(f"  Expected score: {expected_score:.2f}")
    print(f"  Actual score: {actual_score:.2f}")

    checks_total += 1
    if check("Actual score matches expected (within tolerance)", 
             abs(actual_score - expected_score) < 0.01):
        checks_passed += 1

    # Test 3: Perfect match (all scores = 1.0)
    print("\n3. Testing perfect match (all scores = 1.0)...")
    print("-" * 80)

    perfect_scores = ComponentScores(
        skill_score=1.0,
        education_score=1.0,
        interest_score=1.0,
        experience_score=1.0,
        location_score=1.0,
        work_mode_score=1.0,
    )

    perfect_actual = calculate_overall_score(perfect_scores)
    perfect_expected = 100.0  # All weights sum to 1.0, so 1.0 * 1.0 * 100 = 100.0

    print(f"  Expected: {perfect_expected:.2f}")
    print(f"  Actual: {perfect_actual:.2f}")

    checks_total += 1
    if check("Perfect match returns 100.0", perfect_actual == perfect_expected):
        checks_passed += 1

    # Test 4: No match (all scores = 0.0)
    print("\n4. Testing no match (all scores = 0.0)...")
    print("-" * 80)

    no_match_scores = ComponentScores(
        skill_score=0.0,
        education_score=0.0,
        interest_score=0.0,
        experience_score=0.0,
        location_score=0.0,
        work_mode_score=0.0,
    )

    no_match_actual = calculate_overall_score(no_match_scores)
    no_match_expected = 0.0

    print(f"  Expected: {no_match_expected:.2f}")
    print(f"  Actual: {no_match_actual:.2f}")

    checks_total += 1
    if check("No match returns 0.0", no_match_actual == no_match_expected):
        checks_passed += 1

    # Test 5: Partial match (mixed scores)
    print("\n5. Testing partial match (mixed scores)...")
    print("-" * 80)

    partial_scores = ComponentScores(
        skill_score=0.50,
        education_score=0.75,
        interest_score=0.25,
        experience_score=0.40,
        location_score=0.80,
        work_mode_score=0.60,
    )

    partial_expected_raw = (
        0.50 * WEIGHTS["skill_score"]
        + 0.75 * WEIGHTS["education_score"]
        + 0.25 * WEIGHTS["interest_score"]
        + 0.40 * WEIGHTS["experience_score"]
        + 0.80 * WEIGHTS["location_score"]
        + 0.60 * WEIGHTS["work_mode_score"]
    )
    partial_expected = round(partial_expected_raw * 100, 2)
    partial_actual = calculate_overall_score(partial_scores)

    print(f"  Expected: {partial_expected:.2f}")
    print(f"  Actual: {partial_actual:.2f}")

    checks_total += 1
    if check("Partial match matches expected", 
             abs(partial_actual - partial_expected) < 0.01):
        checks_passed += 1

    # Test 6: get_weights returns a copy
    print("\n6. Testing get_weights() returns a copy...")
    print("-" * 80)

    weights_copy = get_weights()
    weights_copy["skill_score"] = 0.99  # Modify the copy

    checks_total += 1
    if check("Original WEIGHTS unchanged", WEIGHTS["skill_score"] == 0.40):
        checks_passed += 1

    # Test 7: Score clamping (should not exceed 100 or go below 0)
    print("\n7. Testing score clamping...")
    print("-" * 80)

    # Test with scores > 1.0 (should clamp to 100)
    high_scores = ComponentScores(
        skill_score=1.5,
        education_score=1.5,
        interest_score=1.5,
        experience_score=1.5,
        location_score=1.5,
        work_mode_score=1.5,
    )

    high_actual = calculate_overall_score(high_scores)

    checks_total += 1
    if check("Scores > 1.0 clamp to 100.0", high_actual <= 100.0):
        checks_passed += 1

    # Test with negative scores (should clamp to 0)
    negative_scores = ComponentScores(
        skill_score=-0.5,
        education_score=-0.5,
        interest_score=-0.5,
        experience_score=-0.5,
        location_score=-0.5,
        work_mode_score=-0.5,
    )

    negative_actual = calculate_overall_score(negative_scores)

    checks_total += 1
    if check("Negative scores clamp to 0.0", negative_actual >= 0.0):
        checks_passed += 1

    # Test 8: Individual component contributions
    print("\n8. Testing individual component contributions...")
    print("-" * 80)

    # Test skill_score contribution only
    skill_only = ComponentScores(skill_score=1.0, education_score=0.0, interest_score=0.0,
                                  experience_score=0.0, location_score=0.0, work_mode_score=0.0)
    skill_only_score = calculate_overall_score(skill_only)
    skill_contribution = round(WEIGHTS["skill_score"] * 100, 2)

    print(f"  Skill-only score: {skill_only_score:.2f}")
    print(f"  Expected skill contribution: {skill_contribution:.2f}")

    checks_total += 1
    if check("Skill contribution matches weight", skill_only_score == skill_contribution):
        checks_passed += 1

    # Test education_score contribution only
    edu_only = ComponentScores(skill_score=0.0, education_score=1.0, interest_score=0.0,
                               experience_score=0.0, location_score=0.0, work_mode_score=0.0)
    edu_only_score = calculate_overall_score(edu_only)
    edu_contribution = round(WEIGHTS["education_score"] * 100, 2)

    print(f"  Education-only score: {edu_only_score:.2f}")
    print(f"  Expected education contribution: {edu_contribution:.2f}")

    checks_total += 1
    if check("Education contribution matches weight", edu_only_score == edu_contribution):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.5: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_weighted_ranking())
