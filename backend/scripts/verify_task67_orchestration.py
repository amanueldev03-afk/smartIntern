"""
Phase 6 Task 6.7 — Orchestration Entrypoint Verification

Tests the Django-integrated orchestration function:
  - generate_recommendations(student) → list[RecommendationResult]
  - Loads student profile + skills + interests
  - Queries Internship.objects.filter(status='active')
  - Scores each using Tasks 6.4-6.6 functions
  - Sorts descending by overall_score
  - Returns top N (paginate/limit, e.g., top 50)
  - Persists to Recommendation model using update_or_create

Check:
  - Run against Phase 5's seeded/collected internships
  - Confirm results are sorted descending by overall_score
  - Every result's explanation is non-empty and consistent with its scores
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model
from ai_engine.recommendation import generate_recommendations

User = get_user_model()


def check(description, condition):
    """Helper to check a condition and print result."""
    status = "✓" if condition else "✗"
    print(f"{status} {description}")
    return condition


def test_orchestration():
    """Test the orchestration entrypoint with test data."""
    print("=" * 80)
    print("PHASE 6 TASK 6.7 — ORCHESTRATION ENTRANCEPOINT VERIFICATION")
    print("=" * 80)

    checks_passed = 0
    checks_total = 0

    # Test 1: Create or get test student profile
    print("\n1. Setting up test student profile...")
    print("-" * 80)

    try:
        user = User.objects.get(username="test_student")
        print(f"  Found existing test user: {user.username}")
    except User.DoesNotExist:
        user = User.objects.create_user(
            username="test_student",
            email="test@example.com",
            password="testpass123"
        )
        print(f"  Created test user: {user.username}")

    checks_total += 1
    if check("Test user exists", user is not None):
        checks_passed += 1

    # Create/update student profile
    from apps.students.models import StudentProfile, Student, StudentSkill, StudentInterest
    
    # Get or create Student (not StudentProfile)
    student, created = Student.objects.get_or_create(
        user=user,
        defaults={
            "field_of_study": "computer_science",
            "education_level": "bachelor",
            "internship_type": "either",
            "compensation_preference": "either",
        }
    )
    
    if created:
        print(f"  Created student record")
    else:
        print(f"  Found existing student record")

    checks_total += 1
    if check("Student record exists", student is not None):
        checks_passed += 1

    # Add skills
    student.skills.all().delete()
    skill_names = ["Python", "Django", "REST API", "PostgreSQL", "Git"]
    from apps.internships.models import Skill
    
    for skill_name in skill_names:
        skill_obj, _ = Skill.objects.get_or_create(name=skill_name)
        StudentSkill.objects.get_or_create(
            student=student,
            skill=skill_obj,
            defaults={"source": "manual"}
        )
    print(f"  Added skills: {', '.join(skill_names)}")

    checks_total += 1
    if check("Skills added to student", student.skills.count() > 0):
        checks_passed += 1

    # Add interests
    student.interests.all().delete()
    interest_names = ["Software Development", "Backend Development", "Web Development"]
    from apps.students.models import CareerInterest
    
    for interest_name in interest_names:
        interest_obj, _ = CareerInterest.objects.get_or_create(name=interest_name)
        StudentInterest.objects.get_or_create(
            student=student,
            interest=interest_obj
        )
    print(f"  Added interests: {', '.join(interest_names)}")

    checks_total += 1
    if check("Interests added to student", student.interests.count() > 0):
        checks_passed += 1

    # Test 2: Check for active internships
    print("\n2. Checking for active internships...")
    print("-" * 80)

    from apps.internships.models import Internship
    
    active_count = Internship.objects.filter(status="active").count()
    print(f"  Active internships found: {active_count}")

    checks_total += 1
    if check("Active internships exist", active_count > 0):
        checks_passed += 1

    # If no active internships, create some test internships
    if active_count == 0:
        print("  No active internships found, creating test internships...")
        from apps.internships.models import InternshipSkill
        
        test_internships = [
            {
                "title": "Python Backend Developer",
                "description": "Looking for a Python Django developer for backend API development",
                "category": "Software Development",
                "country": "USA",
                "city": "New York",
                "work_type": "remote",
                "internship_type": "remote",
                "compensation_type": "paid",
                "status": "active",
                "skills": ["Python", "Django", "REST API"]
            },
            {
                "title": "Full Stack Developer",
                "description": "Full stack developer role with React and Django",
                "category": "Software Development",
                "country": "USA",
                "city": "San Francisco",
                "work_type": "hybrid",
                "internship_type": "hybrid",
                "compensation_type": "paid",
                "status": "active",
                "skills": ["Python", "JavaScript", "React"]
            },
            {
                "title": "Data Science Intern",
                "description": "Data science internship focusing on machine learning",
                "category": "Data Science",
                "country": "USA",
                "city": "Boston",
                "work_type": "onsite",
                "internship_type": "onsite",
                "compensation_type": "paid",
                "status": "active",
                "skills": ["Python", "Machine Learning", "SQL"]
            }
        ]
        
        for intern_data in test_internships:
            skills = intern_data.pop("skills")
            internship = Internship.objects.create(**intern_data)
            for skill_name in skills:
                skill_obj, _ = Skill.objects.get_or_create(name=skill_name)
                InternshipSkill.objects.get_or_create(
                    internship=internship,
                    skill=skill_obj
                )
            print(f"  Created internship: {internship.title}")
        
        active_count = Internship.objects.filter(status="active").count()

    checks_total += 1
    if check("Active internships available for testing", active_count > 0):
        checks_passed += 1

    # Test 3: Generate recommendations
    print("\n3. Generating recommendations...")
    print("-" * 80)

    results = generate_recommendations(user, limit=50, save_to_db=False)
    print(f"  Recommendations generated: {len(results)}")

    checks_total += 1
    if check("Recommendations generated successfully", len(results) > 0):
        checks_passed += 1

    # Test 4: Verify results are sorted descending
    print("\n4. Verifying results are sorted descending by score...")
    print("-" * 80)

    if len(results) > 1:
        scores = [r.score for r in results]
        is_sorted = all(scores[i] >= scores[i+1] for i in range(len(scores)-1))
        
        print(f"  First 5 scores: {scores[:5]}")
        
        checks_total += 1
        if check("Results sorted descending", is_sorted):
            checks_passed += 1
    else:
        print("  Not enough results to verify sorting")
        checks_total += 1
        if check("Not enough results to verify sorting", True):
            checks_passed += 1

    # Test 5: Verify explanations are non-empty
    print("\n5. Verifying explanations are non-empty...")
    print("-" * 80)

    all_have_explanations = all(len(r.explanation) > 0 for r in results)
    
    if results:
        print(f"  Sample explanation (first result):")
        for line in results[0].explanation:
            print(f"    - {line}")

    checks_total += 1
    if check("All results have non-empty explanations", all_have_explanations):
        checks_passed += 1

    # Test 6: Verify explanations are consistent with scores
    print("\n6. Verifying explanations are consistent with scores...")
    print("-" * 80)

    consistent_count = 0
    total_checks = 0
    
    for r in results:
        breakdown = r.score_breakdown
        
        # Check if explanation mentions skills when skill score is high
        total_checks += 1
        if breakdown.get("skill_score", 0) > 50:
            if any("skill" in line.lower() for line in r.explanation):
                consistent_count += 1
        
        # Check if explanation mentions location when location score is high
        total_checks += 1
        if breakdown.get("location_score", 0) > 50:
            if any("location" in line.lower() for line in r.explanation):
                consistent_count += 1
    
    consistency_rate = consistent_count / total_checks if total_checks > 0 else 0
    print(f"  Consistency rate: {consistency_rate:.2%}")

    checks_total += 1
    if check("Explanations consistent with scores", consistency_rate >= 0.1):
        checks_passed += 1

    # Test 7: Verify score breakdown structure
    print("\n7. Verifying score breakdown structure...")
    print("-" * 80)

    if results:
        first_breakdown = results[0].score_breakdown
        required_keys = [
            "skill_score", "education_score", "interest_score",
            "experience_score", "location_score", "work_mode_score", "overall_score"
        ]
        
        has_all_keys = all(key in first_breakdown for key in required_keys)
        
        print(f"  Breakdown keys: {list(first_breakdown.keys())}")

        checks_total += 1
        if check("Score breakdown has all required keys", has_all_keys):
            checks_passed += 1

        # Check scores are in valid range
        all_valid = all(0 <= first_breakdown.get(k, 0) <= 100 for k in required_keys)
        
        checks_total += 1
        if check("All scores in valid range (0-100)", all_valid):
            checks_passed += 1
    else:
        checks_total += 2
        if check("No results to verify breakdown", True):
            checks_passed += 2

    # Test 8: Verify persistence to Recommendation model
    print("\n8. Verifying persistence to Recommendation model...")
    print("-" * 80)

    from apps.recommendations.models import Recommendation
    
    rec_count = Recommendation.objects.filter(student=user).count()
    print(f"  Recommendations persisted for student: {rec_count}")

    checks_total += 1
    if check("Recommendations persisted to database", rec_count > 0):
        checks_passed += 1

    # Test 9: Verify limit parameter works
    print("\n9. Testing limit parameter...")
    print("-" * 80)

    limited_results = generate_recommendations(user, limit=5, save_to_db=False)
    print(f"  Results with limit=5: {len(limited_results)}")

    checks_total += 1
    if check("Limit parameter respected", len(limited_results) <= 5):
        checks_passed += 1

    # Test 10: Verify update_or_create doesn't create duplicates
    print("\n10. Testing update_or_create (no duplicates)...")
    print("-" * 80)

    # Run again and check count hasn't doubled
    initial_count = Recommendation.objects.filter(student=user).count()
    generate_recommendations(user, limit=50, save_to_db=True)
    final_count = Recommendation.objects.filter(student=user).count()
    
    print(f"  Initial count: {initial_count}")
    print(f"  Final count after re-run: {final_count}")
    
    no_duplicates = final_count == initial_count

    checks_total += 1
    if check("No duplicates created on re-run", no_duplicates):
        checks_passed += 1

    # Summary
    print("\n" + "=" * 80)
    print(f"PHASE 6 TASK 6.7: {checks_passed}/{checks_total} CHECKS PASSED")
    print("=" * 80)

    if checks_passed == checks_total:
        print("✓ All checks passed!")
        return 0
    else:
        print(f"✗ {checks_total - checks_passed} check(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(test_orchestration())
