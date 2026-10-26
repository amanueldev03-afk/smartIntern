"""
Phase 6 Task 6.3 — Semantic Matching Verification

Tests the semantic matching module's ability to:
1. Generate embeddings using sentence-transformers (all-MiniLM-L6-v2)
2. Compute cosine similarity between embeddings
3. Catch synonyms that exact-match misses (Section 4.5 example)
4. Blend exact-match and semantic scores (60/40 default weights)

Check: Unit test the doc's exact synonym example — confirm semantic similarity
between "Backend Development" and "Django API Developer" is meaningfully higher
than between "Backend Development" and "Graphic Design".
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from ai_engine.embeddings import generate_text_embedding
from ai_engine.semantic_matching import similarity_score
from ai_engine.skill_matching import blended_skill_score, exact_skill_score


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_semantic_matching():
    """Test semantic matching with Section 4.5 synonym example."""
    print("=" * 80)
    print("PHASE 6 TASK 6.3 — SEMANTIC MATCHING VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Section 4.5 example: Backend Development ≈ Django API Developer
    print("\n1. Testing Section 4.5 synonym example...")
    print("-" * 80)

    backend_dev_text = "Backend Development"
    django_api_text = "Django API Developer"
    graphic_design_text = "Graphic Design"

    backend_embedding = generate_text_embedding(backend_dev_text)
    django_embedding = generate_text_embedding(django_api_text)
    graphic_embedding = generate_text_embedding(graphic_design_text)

    checks_total += 1
    if check("Backend Development embedding generated", len(backend_embedding) == 384):
        checks_passed += 1

    checks_total += 1
    if check("Django API Developer embedding generated", len(django_embedding) == 384):
        checks_passed += 1

    checks_total += 1
    if check("Graphic Design embedding generated", len(graphic_embedding) == 384):
        checks_passed += 1

    # Calculate similarities
    backend_django_sim = similarity_score(backend_embedding, django_embedding)
    backend_graphic_sim = similarity_score(backend_embedding, graphic_embedding)

    checks_total += 1
    if check("Backend vs Django similarity is a number", isinstance(backend_django_sim, (int, float))):
        checks_passed += 1

    checks_total += 1
    if check("Backend vs Graphic similarity is a number", isinstance(backend_graphic_sim, (int, float))):
        checks_passed += 1

    print(f"  Similarity (Backend Development vs Django API Developer): {backend_django_sim:.2f}")
    print(f"  Similarity (Backend Development vs Graphic Design): {backend_graphic_sim:.2f}")

    # The key check: Backend/Django should be meaningfully higher than Backend/Graphic
    checks_total += 1
    if check("Backend vs Django similarity > Backend vs Graphic similarity", 
             backend_django_sim > backend_graphic_sim):
        checks_passed += 1

    # They should differ by at least 5 points to be "meaningfully higher"
    checks_total += 1
    if check("Difference is meaningful (>5 points)", 
             (backend_django_sim - backend_graphic_sim) > 5):
        checks_passed += 1

    # Test blended skill score
    print("\n2. Testing blended skill score (exact + semantic)...")
    print("-" * 80)

    student_skills = ["Python", "Django"]
    internship_skills = ["Backend Development", "API Development"]
    student_text = "Python Django web development"
    internship_desc = "Backend API Developer position"

    blended = blended_skill_score(
        student_skills,
        internship_skills,
        student_text,
        internship_desc,
        exact_weight=0.6,
        semantic_weight=0.4
    )

    checks_total += 1
    if check("blended_skill_score returns a number", isinstance(blended, (int, float))):
        checks_passed += 1

    checks_total += 1
    if check("Blended score is between 0.0 and 1.0", 0.0 <= blended <= 1.0):
        checks_passed += 1

    # Calculate exact score for comparison
    exact = exact_skill_score(student_skills, internship_skills)
    print(f"  Exact-match score: {exact:.3f}")
    print(f"  Blended score (60/40): {blended:.3f}")

    # Blended should be higher than exact when semantic similarity is positive
    checks_total += 1
    if check("Blended score >= exact score (semantic adds value)", blended >= exact):
        checks_passed += 1

    # Test fallback when semantic inputs missing
    print("\n3. Testing fallback behavior...")
    print("-" * 80)

    blended_no_semantic = blended_skill_score(
        student_skills,
        internship_skills,
        student_text=None,  # Missing semantic input
        internship_description=None
    )

    checks_total += 1
    if check("Fallback to exact score when semantic inputs missing", 
             blended_no_semantic == exact):
        checks_passed += 1

    # Test with zero exact match but high semantic similarity
    print("\n4. Testing zero exact match with high semantic similarity...")
    print("-" * 80)

    student_skills_no_match = ["Python", "Django"]
    internship_skills_no_match = ["Backend Development", "API Development"]
    student_text_semantic = "Experienced Python Django developer building web applications"
    internship_desc_semantic = "Backend API developer role for web applications"

    blended_semantic = blended_skill_score(
        student_skills_no_match,
        internship_skills_no_match,
        student_text_semantic,
        internship_desc_semantic,
        exact_weight=0.6,
        semantic_weight=0.4
    )

    exact_no_match = exact_skill_score(student_skills_no_match, internship_skills_no_match)
    print(f"  Exact-match score (no overlap): {exact_no_match:.3f}")
    print(f"  Blended score (with semantic): {blended_semantic:.3f}")

    checks_total += 1
    if check("Blended > exact when semantic similarity is high", 
             blended_semantic > exact_no_match):
        checks_passed += 1

    # Test different weight configurations
    print("\n5. Testing different weight configurations...")
    print("-" * 80)

    blended_80_20 = blended_skill_score(
        student_skills,
        internship_skills,
        student_text,
        internship_desc,
        exact_weight=0.8,
        semantic_weight=0.2
    )

    blended_50_50 = blended_skill_score(
        student_skills,
        internship_skills,
        student_text,
        internship_desc,
        exact_weight=0.5,
        semantic_weight=0.5
    )

    print(f"  Blended (80/20): {blended_80_20:.3f}")
    print(f"  Blended (60/40): {blended:.3f}")
    print(f"  Blended (50/50): {blended_50_50:.3f}")

    # When exact is 0.0, higher semantic weight produces higher score
    checks_total += 1
    if check("Higher semantic weight produces higher score when exact=0", 
             blended_50_50 >= blended_80_20):
        checks_passed += 1

    # Test edge cases
    print("\n6. Testing edge cases...")
    print("-" * 80)

    # Empty inputs
    empty_blended = blended_skill_score([], [], "", "")
    checks_total += 1
    if check("Empty inputs return valid score (0.0 or 0.5)", empty_blended in [0.0, 0.5]):
        checks_passed += 1

    # Identical texts (should have high similarity)
    identical_sim = similarity_score(backend_embedding, backend_embedding)
    checks_total += 1
    if check("Identical texts have similarity ~100", identical_sim > 95):
        checks_passed += 1

    # Unrelated texts (should have low similarity)
    unrelated_text = "Cooking recipes and food preparation"
    unrelated_embedding = generate_text_embedding(unrelated_text)
    unrelated_sim = similarity_score(backend_embedding, unrelated_embedding)
    checks_total += 1
    if check("Unrelated texts have low similarity", unrelated_sim < 30):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.3: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_semantic_matching())
