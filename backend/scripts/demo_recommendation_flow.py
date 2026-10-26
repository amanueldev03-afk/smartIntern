#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("=" * 80)
print("AI RECOMMENDATION SYSTEM - FULL FLOW DEMONSTRATION")
print("=" * 80)

from apps.students.models import StudentProfile
from apps.internships.models import Internship
from apps.recommendations.services.recommendation_engine_v2 import (
    calculate_semantic_score,
    calculate_skill_score,
    calculate_work_mode_score,
    calculate_location_score,
    passes_hard_filters
)
from apps.recommendations.services.preference_matching import (
    calculate_preference_match,
    get_skill_match_details
)

# Step 1: Get Student Profile
print("\n[STEP 1] Student Profile & Preferences")
print("-" * 80)

student = StudentProfile.objects.first()
if not student:
    print("❌ No student profile found. Creating test profile...")
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.filter(role='student').first()
    if user:
        student, created = StudentProfile.objects.get_or_create(user=user)
        print(f"✅ Student profile created for {user.email}")
    else:
        print("❌ No student user found")
        exit(1)

print(f"Student: {student.user.email}")
print(f"User: {student.user.username}")
print(f"Bio: {student.bio or 'N/A'}")
print(f"Education Level: {student.education_level or 'N/A'}")
print(f"Field of Study: {student.field_of_study or 'N/A'}")
print(f"University: {student.university or 'N/A'}")

print(f"\nSkills ({student.skills.count()}):")
for skill in student.skills.all():
    print(f"  - {skill.name} ({skill.category})")

print(f"\nPreferences:")
print(f"  Work Type: {student.work_type or 'N/A'}")
print(f"  Internship Type: {student.internship_type or 'N/A'}")
print(f"  Preferred Locations: {student.preferred_locations or 'N/A'}")
print(f"  Preferred Industries: {student.preferred_industries or 'N/A'}")
print(f"  Preferred Roles: {student.preferred_roles or 'N/A'}")
print(f"  Compensation: {student.compensation_preference or 'N/A'}")
print(f"  Duration: {student.internship_duration_min_weeks or 'N/A'} - {student.internship_duration_max_weeks or 'N/A'} weeks")

# Step 2: Get Available Internships
print("\n[STEP 2] Available Internships")
print("-" * 80)

internships = Internship.objects.filter(status='active', is_verified=True)[:10]
print(f"Found {len(internships)} active internships")

for i, internship in enumerate(internships, 1):
    print(f"\n{i}. {internship.title}")
    print(f"   Organization: {internship.organization_name}")
    print(f"   Location: {internship.location_text or internship.city or 'N/A'}")
    print(f"   Work Type: {internship.work_type}")
    print(f"   Internship Type: {internship.internship_type}")
    print(f"   Required Skills ({internship.required_skills.count()}):")
    for skill in internship.required_skills.all():
        print(f"     - {skill.name}")

# Step 3: Calculate Matching Scores
print("\n[STEP 3] Recommendation Matching")
print("-" * 80)

recommendations = []

for internship in internships:
    # Check hard filters
    if not passes_hard_filters(internship, student):
        continue
    
    # Calculate individual scores
    student_skills = list(student.skills.values_list('name', flat=True))
    internship_skills = list(internship.required_skills.values_list('name', flat=True))
    
    semantic_score = calculate_semantic_score(student, internship)
    skill_score = calculate_skill_score(student_skills, internship_skills)
    work_mode_score = calculate_work_mode_score(internship, student)
    location_score = calculate_location_score(internship, student)
    
    # Calculate overall score (weighted average)
    # Based on recommendation_engine_v2 weights:
    # 40% semantic, 25% skills, 20% preferences, 10% location, 5% other
    overall_score = (
        semantic_score * 0.40 +
        skill_score * 0.25 +
        work_mode_score * 0.20 +
        location_score * 0.10 +
        0.05  # base score
    )
    
    # Get skill match details
    skill_details = get_skill_match_details(student, internship)
    
    recommendations.append({
        'internship': internship,
        'overall_score': overall_score,
        'semantic_score': semantic_score,
        'skill_score': skill_score,
        'work_mode_score': work_mode_score,
        'location_score': location_score,
        'matched_skills': skill_details.get('matched_skills', []),
        'missing_skills': skill_details.get('missing_skills', []),
    })

# Step 4: Rank and Display Results
print("\n[STEP 4] Ranked Recommendations")
print("-" * 80)

# Sort by overall score (descending)
recommendations.sort(key=lambda x: x['overall_score'], reverse=True)

if not recommendations:
    print("⚠️ No recommendations generated (all internships filtered by hard constraints)")
else:
    print(f"Generated {len(recommendations)} recommendations\n")
    
    for i, rec in enumerate(recommendations, 1):
        internship = rec['internship']
        print(f"\n{'='*80}")
        print(f"RANK #{i} - Score: {rec['overall_score']:.2%}")
        print(f"{'='*80}")
        print(f"\n📋 Internship: {internship.title}")
        print(f"🏢 Organization: {internship.organization_name}")
        print(f"📍 Location: {internship.location_text or internship.city or 'N/A'}")
        print(f"💰 Compensation: {internship.compensation_type or 'N/A'}")
        print(f"🔗 Apply: {internship.application_url or 'N/A'}")
        
        print(f"\n📊 Score Breakdown:")
        print(f"   Semantic Match (40%): {rec['semantic_score']:.2%}")
        print(f"   Skill Match (25%): {rec['skill_score']:.2%}")
        print(f"   Work Mode Match (20%): {rec['work_mode_score']:.2%}")
        print(f"   Location Match (10%): {rec['location_score']:.2%}")
        
        print(f"\n🎯 Skill Matching:")
        print(f"   Matched Skills ({len(rec['matched_skills'])}):")
        for skill in rec['matched_skills']:
            print(f"     ✅ {skill}")
        print(f"   Missing Skills ({len(rec['missing_skills'])}):")
        for skill in rec['missing_skills']:
            print(f"     ❌ {skill}")
        
        print(f"\n📝 Description:")
        print(f"   {internship.description[:200]}...")

# Step 5: Summary
print("\n" + "=" * 80)
print("RECOMMENDATION SUMMARY")
print("=" * 80)
print(f"Total Internships Analyzed: {len(internships)}")
print(f"Recommendations Generated: {len(recommendations)}")
print(f"Match Rate: {len(recommendations)/len(internships)*100:.1f}%")

if recommendations:
    print(f"\nTop Recommendation: {recommendations[0]['internship'].title}")
    print(f"Top Score: {recommendations[0]['overall_score']:.2%}")
    print(f"Bottom Score: {recommendations[-1]['overall_score']:.2%}")

print("\n" + "=" * 80)
print("DEMO COMPLETE")
print("=" * 80)
