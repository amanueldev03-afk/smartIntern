#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("=" * 80)
print("CV EXTRACTION & PROFILE MERGING VERIFICATION")
print("=" * 80)

# Test 1: CV Parser Module
print("\n[TEST 1] CV Parser Module")
print("-" * 80)
try:
    from ai_engine.resume_parser import parse_cv
    from ai_engine.models import ParsedCV
    print("✅ CV parser module imported")
    
    # Test with sample resume text
    sample_resume = """
    John Doe
    Software Developer
    
    Skills:
    - Python
    - Django
    - React
    - JavaScript
    - SQL
    
    Experience:
    - Software Developer at Tech Corp (2020-2023)
    - Junior Developer at Startup Inc (2018-2020)
    
    Education:
    - Bachelor of Computer Science, MIT (2018)
    """
    
    parsed = parse_cv(sample_resume)
    print(f"✅ CV parsed successfully")
    print(f"   Skills extracted: {len(parsed.skills)}")
    print(f"   Skills: {parsed.skills}")
    print(f"   Experience years: {parsed.experience_years}")
    print(f"   Certifications: {len(parsed.certifications)}")
    print(f"   Projects: {len(parsed.projects)}")
except Exception as e:
    print(f"❌ CV parser failed: {e}")
    import traceback
    traceback.print_exc()

# Test 2: CV Models in Database
print("\n[TEST 2] CV Models in Database")
print("-" * 80)
try:
    from apps.students.models import CV as CVModel, StudentCV
    
    cv_count = CVModel.objects.count()
    student_cv_count = StudentCV.objects.count()
    
    print(f"✅ CV model count: {cv_count}")
    print(f"✅ StudentCV model count: {student_cv_count}")
    
    # Check CV structure
    if cv_count > 0:
        latest_cv = CVModel.objects.first()
        print(f"✅ Latest CV found (ID: {latest_cv.id})")
        print(f"   Processing status: {latest_cv.processing_status}")
        print(f"   Has extracted_text: {bool(latest_cv.extracted_text)}")
        print(f"   Has extracted_skills: {bool(latest_cv.extracted_skills)}")
        print(f"   Has extracted_experience: {bool(latest_cv.extracted_experience)}")
        print(f"   Has extracted_education: {bool(latest_cv.extracted_education)}")
        
        if latest_cv.extracted_skills:
            print(f"   Extracted skills: {latest_cv.extracted_skills}")
except Exception as e:
    print(f"❌ CV models check failed: {e}")

# Test 3: Profile + CV Skill Merging
print("\n[TEST 3] Profile + CV Skill Merging")
print("-" * 80)
try:
    from apps.students.models import StudentProfile
    from apps.recommendations.services.recommendation_engine_v2 import _get_student_skills
    
    student = StudentProfile.objects.first()
    if student:
        profile_skills = list(student.skills.values_list("name", flat=True))
        merged_skills = _get_student_skills(student)
        
        print(f"✅ Student profile found (ID: {student.id})")
        print(f"   Profile skills: {profile_skills}")
        print(f"   Merged skills (profile + CV): {merged_skills}")
        print(f"   Total merged skills: {len(merged_skills)}")
        print(f"   Skills added from CV: {len(merged_skills) - len(profile_skills)}")
    else:
        print("⚠️ No student profile found")
except Exception as e:
    print(f"❌ Skill merging failed: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Semantic Text Building with CV
print("\n[TEST 4] Semantic Text Building with CV")
print("-" * 80)
try:
    from apps.recommendations.services.semantic_matching import build_student_text
    
    student = StudentProfile.objects.first()
    if student:
        semantic_text = build_student_text(student)
        print(f"✅ Semantic text built for student (ID: {student.id})")
        print(f"   Text length: {len(semantic_text)} characters")
        print(f"   Text preview (first 500 chars):")
        print(f"   {semantic_text[:500]}...")
        
        # Check if CV content is included
        if "CV" in semantic_text or "Skills:" in semantic_text:
            print("✅ CV content included in semantic text")
        else:
            print("⚠️ CV content not found in semantic text (may not have CV)")
    else:
        print("⚠️ No student profile found")
except Exception as e:
    print(f"❌ Semantic text building failed: {e}")
    import traceback
    traceback.print_exc()

# Test 5: CV-Based Matching Score
print("\n[TEST 5] CV-Based Matching Score")
print("-" * 80)
try:
    from apps.recommendations.services.hybrid_matching import calculate_cv_match_score
    from apps.internships.models import Internship
    
    student = StudentProfile.objects.first()
    internship = Internship.objects.filter(status='active').first()
    
    if student and internship:
        cv_score = calculate_cv_match_score(student, internship)
        print(f"✅ CV-based matching score calculated")
        print(f"   Student: {student.user.email}")
        print(f"   Internship: {internship.title}")
        print(f"   CV Match Score: {cv_score}%")
    else:
        print("⚠️ No student or internship found")
except Exception as e:
    print(f"❌ CV-based matching failed: {e}")
    import traceback
    traceback.print_exc()

# Test 6: Full Recommendation with CV Integration
print("\n[TEST 6] Full Recommendation with CV Integration")
print("-" * 80)
try:
    from apps.recommendations.services.recommendation_engine_v2 import (
        calculate_semantic_score,
        calculate_skill_score,
        passes_hard_filters
    )
    
    student = StudentProfile.objects.first()
    internship = Internship.objects.filter(status='active').first()
    
    if student and internship:
        # Get merged skills (profile + CV)
        student_skills = _get_student_skills(student)
        internship_skills = list(internship.required_skills.values_list('name', flat=True))
        
        # Calculate scores
        semantic_score = calculate_semantic_score(student, internship)
        skill_score = calculate_skill_score(student_skills, internship_skills)
        
        print(f"✅ Full recommendation calculated")
        print(f"   Student: {student.user.email}")
        print(f"   Internship: {internship.title}")
        print(f"   Student skills (merged): {student_skills}")
        print(f"   Internship required skills: {internship_skills}")
        print(f"   Semantic score (includes CV in embedding): {semantic_score:.2%}")
        print(f"   Skill score (includes CV skills): {skill_score:.2%}")
        
        # Calculate overall score
        overall_score = semantic_score * 0.40 + skill_score * 0.25 + 0.35
        print(f"   Overall score: {overall_score:.2%}")
    else:
        print("⚠️ No student or internship found")
except Exception as e:
    print(f"❌ Full recommendation failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("CV EXTRACTION & PROFILE MERGING VERIFICATION COMPLETE")
print("=" * 80)
