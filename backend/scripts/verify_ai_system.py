#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print("=" * 60)
print("AI SYSTEM VERIFICATION")
print("=" * 60)

# Test 1: Check AI Engine Modules
print("\n[TEST 1] AI Engine Modules Import")
try:
    from ai_engine import models
    print("✅ ai_engine.models imported")
except Exception as e:
    print(f"❌ ai_engine.models failed: {e}")

try:
    from ai_engine import embeddings
    print("✅ ai_engine.embeddings imported")
except Exception as e:
    print(f"❌ ai_engine.embeddings failed: {e}")

try:
    from ai_engine import semantic_matching
    print("✅ ai_engine.semantic_matching imported")
except Exception as e:
    print(f"❌ ai_engine.semantic_matching failed: {e}")

try:
    from ai_engine import skill_matching
    print("✅ ai_engine.skill_matching imported")
except Exception as e:
    print(f"❌ ai_engine.skill_matching failed: {e}")

# Test 2: Embedding Generation
print("\n[TEST 2] Embedding Generation")
try:
    from apps.recommendations.services.semantic_matching import generate_embedding
    test_text = "Python Developer with experience in Django and React"
    embedding = generate_embedding(test_text)
    if embedding and len(embedding) == 384:
        print(f"✅ Embedding generated successfully (dimension: {len(embedding)})")
    else:
        print(f"❌ Embedding dimension incorrect: {len(embedding) if embedding else 0}")
except Exception as e:
    print(f"❌ Embedding generation failed: {e}")

# Test 3: Semantic Similarity
print("\n[TEST 3] Semantic Similarity Calculation")
try:
    from apps.recommendations.services.semantic_matching import calculate_semantic_similarity
    text1 = "Python Developer"
    text2 = "Django Developer"
    text3 = "Graphic Designer"
    
    emb1 = generate_embedding(text1)
    emb2 = generate_embedding(text2)
    emb3 = generate_embedding(text3)
    
    sim_12 = calculate_semantic_similarity(emb1, emb2)
    sim_13 = calculate_semantic_similarity(emb1, emb3)
    
    print(f"✅ Similarity (Python vs Django): {sim_12}")
    print(f"✅ Similarity (Python vs Graphic Design): {sim_13}")
    
    if sim_12 > sim_13:
        print("✅ Semantic similarity working correctly (related > unrelated)")
    else:
        print("❌ Semantic similarity may not be working correctly")
except Exception as e:
    print(f"❌ Semantic similarity failed: {e}")

# Test 4: Student Profile Embedding
print("\n[TEST 4] Student Profile Embedding")
try:
    from apps.students.models import StudentProfile
    from apps.recommendations.services.semantic_matching import generate_student_embedding
    
    student_profile = StudentProfile.objects.first()
    if student_profile:
        student_embedding = generate_student_embedding(student_profile)
        if student_embedding and len(student_embedding) == 384:
            print(f"✅ Student embedding generated (ID: {student_profile.id})")
        else:
            print(f"❌ Student embedding failed")
    else:
        print("⚠️ No student profile found in database")
except Exception as e:
    print(f"❌ Student profile embedding failed: {e}")

# Test 5: Internship Embedding
print("\n[TEST 5] Internship Embedding")
try:
    from apps.internships.models import Internship
    from apps.recommendations.services.semantic_matching import generate_internship_embedding
    
    internship = Internship.objects.filter(status='active').first()
    if internship:
        internship_embedding = generate_internship_embedding(internship)
        if internship_embedding and len(internship_embedding) == 384:
            print(f"✅ Internship embedding generated (ID: {internship.id}, Title: {internship.title})")
        else:
            print(f"❌ Internship embedding failed")
    else:
        print("⚠️ No active internship found in database")
except Exception as e:
    print(f"❌ Internship embedding failed: {e}")

# Test 6: Recommendation Engine
print("\n[TEST 6] Recommendation Engine")
try:
    from apps.recommendations.services.recommendation_engine_v2 import calculate_semantic_score, calculate_skill_score, passes_hard_filters
    
    student_profile = StudentProfile.objects.first()
    internship = Internship.objects.filter(status='active').first()
    
    if student_profile and internship:
        semantic_score = calculate_semantic_score(student_profile, internship)
        print(f"✅ Semantic score calculated: {semantic_score}")
        
        student_skills = list(student_profile.skills.values_list('name', flat=True))
        internship_skills = list(internship.required_skills.values_list('name', flat=True))
        skill_score = calculate_skill_score(student_skills, internship_skills)
        print(f"✅ Skill score calculated: {skill_score}")
        
        passes = passes_hard_filters(internship, student_profile)
        print(f"✅ Hard filters check: {passes}")
        
        print(f"✅ Recommendation engine components working")
    else:
        print("⚠️ No student profile or internship found")
except Exception as e:
    print(f"❌ Recommendation engine failed: {e}")
    import traceback
    traceback.print_exc()

# Test 7: Skill Matching
print("\n[TEST 7] Skill Matching")
try:
    from ai_engine.skill_matching import blended_skill_score, exact_skill_score
    
    student_skills = ["Python", "Django", "React"]
    internship_skills = ["Python", "Django", "Flask"]
    
    exact_score = exact_skill_score(student_skills, internship_skills)
    blended_score = blended_skill_score(student_skills, internship_skills)
    
    print(f"✅ Exact skill score: {exact_score}")
    print(f"✅ Blended skill score: {blended_score}")
except Exception as e:
    print(f"❌ Skill matching failed: {e}")

# Test 8: Celery Tasks for Embedding
print("\n[TEST 8] Celery Tasks")
try:
    from apps.students.tasks import generate_student_embedding_task
    from apps.internships.tasks import generate_internship_embedding_task
    
    print("✅ Student embedding task imported")
    print("✅ Internship embedding task imported")
except Exception as e:
    print(f"❌ Celery tasks failed: {e}")

print("\n" + "=" * 60)
print("AI SYSTEM VERIFICATION COMPLETE")
print("=" * 60)
