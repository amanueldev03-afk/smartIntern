"""
Test script for Task 2.1:
Hybrid Sentence-Transformers & pgvector Semantic Matcher
Tests:
  1. SentenceTransformer singleton embedding loader
  2. pgvector CosineDistance query execution via HNSW index
  3. 6-factor hybrid match scoring and XAI explanation generation
  4. Celery recalculate_student_matches_task persistence
"""

import os
import sys
import django

# Setup Django environment
sys.path.insert(0, "/home/amanuel/Documents/SmartIntern-ET/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.contrib.auth import get_user_model
from pgvector.django import CosineDistance
from apps.internships.models import Internship, Skill
from apps.students.models import StudentProfile, CareerInterest
from apps.recommendations.models import Recommendation
from apps.recommendations.tasks import recalculate_student_matches_task
from ai_engine.models.loader import get_embedding, normalize_text
from ai_engine.services.matcher import (
    calculate_match_score,
    get_ranked_recommendations,
    build_student_text_representation,
    build_internship_text_representation,
)

User = get_user_model()


def run_tests():
    print("=" * 70)
    print("STARTING TEST SUITE: Task 2.1 Hybrid Matcher & pgvector Verification")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. Model Loader & Embedding Normalization
    # -------------------------------------------------------------
    print("\n[Test 1] Verifying SentenceTransformer Loader & Text Normalization...")
    sample_text = "Software Engineer: Python, Django, PostgreSQL & C++! Addis Ababa"
    norm = normalize_text(sample_text)
    assert norm == "software engineer python django postgresql c++ addis ababa", f"Unexpected norm: {norm}"
    
    emb = get_embedding(sample_text)
    assert isinstance(emb, list), "Embedding must be a list"
    assert len(emb) == 384, f"Embedding must have length 384, got {len(emb)}"
    assert all(isinstance(v, float) for v in emb), "Embedding elements must be floats"
    print("✓ Model Loader returned 384-dimensional normalized vector.")

    # -------------------------------------------------------------
    # 2. Setup Skills & Career Interests
    # -------------------------------------------------------------
    print("\n[Test 2] Setting up Skills and Career Interests in Database...")
    skill_names = [
        "Python", "Django", "PostgreSQL", "Docker", "Git", "Celery",
        "JavaScript", "React", "HTML", "CSS", "Tailwind CSS",
        "Linux", "AWS", "SQL", "PyTorch", "Machine Learning",
        "Photoshop", "Illustrator"
    ]
    skills_map = {}
    for name in skill_names:
        skill, _ = Skill.objects.get_or_create(name=name)
        skills_map[name] = skill

    interest_names = ["Software Development", "Web Development", "Cloud Computing", "Artificial Intelligence", "Marketing"]
    interests_map = {}
    for name in interest_names:
        interest, _ = CareerInterest.objects.get_or_create(name=name)
        interests_map[name] = interest
    print(f"✓ Created/verified {len(skills_map)} skills and {len(interests_map)} career interests.")

    # -------------------------------------------------------------
    # 3. Setup 3 Sample Student Profiles
    # -------------------------------------------------------------
    print("\n[Test 3] Creating 3 Sample Student Profiles...")
    
    # Student 1: Senior Software Engineering student in Addis Ababa
    user1, _ = User.objects.get_or_create(
        email="test_student1@smartintern.et",
        defaults={"role": "student", "first_name": "Abebe", "last_name": "Kebede"}
    )
    user1.set_password("TestPass123!")
    user1.save()
    profile1, _ = StudentProfile.objects.get_or_create(user=user1)
    profile1.field_of_study = "Software Engineering"
    profile1.education_level = "bachelor"
    profile1.current_year = 4
    profile1.city = "Addis Ababa"
    profile1.country = "Ethiopia"
    profile1.internship_type = "remote"
    profile1.willing_to_relocate = True
    profile1.bio = "Experienced backend developer passionate about distributed Python systems."
    profile1.save()
    profile1.skills.set([skills_map["Python"], skills_map["Django"], skills_map["PostgreSQL"], skills_map["Docker"], skills_map["Git"]])
    profile1.interests.set([interests_map["Software Development"], interests_map["Artificial Intelligence"]])
    profile1.embedding = get_embedding(build_student_text_representation(profile1))
    profile1.save(update_fields=["embedding"])

    # Student 2: Sophomore Web Development student in Hawassa
    user2, _ = User.objects.get_or_create(
        email="test_student2@smartintern.et",
        defaults={"role": "student", "first_name": "Chaltu", "last_name": "Tadesse"}
    )
    user2.set_password("TestPass123!")
    user2.save()
    profile2, _ = StudentProfile.objects.get_or_create(user=user2)
    profile2.field_of_study = "Computer Science"
    profile2.education_level = "bachelor"
    profile2.current_year = 2
    profile2.city = "Hawassa"
    profile2.country = "Ethiopia"
    profile2.internship_type = "onsite"
    profile2.willing_to_relocate = False
    profile2.bio = "Frontend developer skilled in building interactive UI components."
    profile2.save()
    profile2.skills.set([skills_map["JavaScript"], skills_map["React"], skills_map["HTML"], skills_map["CSS"], skills_map["Tailwind CSS"]])
    profile2.interests.set([interests_map["Web Development"]])
    profile2.embedding = get_embedding(build_student_text_representation(profile2))
    profile2.save(update_fields=["embedding"])

    # Student 3: Junior IT & Cloud student in Bahir Dar
    user3, _ = User.objects.get_or_create(
        email="test_student3@smartintern.et",
        defaults={"role": "student", "first_name": "Dawit", "last_name": "Haile"}
    )
    user3.set_password("TestPass123!")
    user3.save()
    profile3, _ = StudentProfile.objects.get_or_create(user=user3)
    profile3.field_of_study = "Information Technology"
    profile3.education_level = "bachelor"
    profile3.current_year = 3
    profile3.city = "Bahir Dar"
    profile3.country = "Ethiopia"
    profile3.internship_type = "hybrid"
    profile3.willing_to_relocate = True
    profile3.bio = "DevOps enthusiast focused on Linux environments, containers, and cloud architecture."
    profile3.save()
    profile3.skills.set([skills_map["Linux"], skills_map["AWS"], skills_map["SQL"], skills_map["Python"]])
    profile3.interests.set([interests_map["Cloud Computing"]])
    profile3.embedding = get_embedding(build_student_text_representation(profile3))
    profile3.save(update_fields=["embedding"])

    print("✓ 3 student profiles created and embedded.")

    # -------------------------------------------------------------
    # 4. Setup 5 Sample Internships
    # -------------------------------------------------------------
    print("\n[Test 4] Creating 5 Sample Internships...")
    internships_data = [
        {
            "external_id": "test_intern_1",
            "title": "Backend Python & Microservices Intern",
            "category": "Software Development",
            "internship_type": "remote",
            "city": "Addis Ababa",
            "country": "Ethiopia",
            "description": "Design REST APIs with Python, Django, PostgreSQL and Docker.",
            "skills": [skills_map["Python"], skills_map["Django"], skills_map["PostgreSQL"], skills_map["Celery"]],
        },
        {
            "external_id": "test_intern_2",
            "title": "Frontend React UI Intern",
            "category": "Web Development",
            "internship_type": "onsite",
            "city": "Hawassa",
            "country": "Ethiopia",
            "description": "Build single page applications using React, Tailwind and modern JavaScript.",
            "skills": [skills_map["JavaScript"], skills_map["React"], skills_map["Tailwind CSS"]],
        },
        {
            "external_id": "test_intern_3",
            "title": "Cloud Infrastructure & DevOps Intern",
            "category": "Cloud Computing",
            "internship_type": "hybrid",
            "city": "Addis Ababa",
            "country": "Ethiopia",
            "description": "Assist with Linux system administration, AWS cloud deployment, and SQL databases.",
            "skills": [skills_map["Linux"], skills_map["AWS"], skills_map["SQL"], skills_map["Docker"]],
        },
        {
            "external_id": "test_intern_4",
            "title": "AI & Deep Learning Research Intern",
            "category": "Artificial Intelligence",
            "internship_type": "onsite",
            "city": "Addis Ababa",
            "country": "Ethiopia",
            "description": "Senior student placement for training deep learning models with PyTorch and NLP.",
            "skills": [skills_map["Python"], skills_map["PyTorch"], skills_map["Machine Learning"]],
        },
        {
            "external_id": "test_intern_5",
            "title": "Graphic Design & Media Intern",
            "category": "Marketing",
            "internship_type": "onsite",
            "city": "Dire Dawa",
            "country": "Ethiopia",
            "description": "Produce brand assets, social banners and flyers using Photoshop and Illustrator.",
            "skills": [skills_map["Photoshop"], skills_map["Illustrator"]],
        },
    ]

    internships = []
    for item in internships_data:
        internship, _ = Internship.objects.get_or_create(
            external_id=item["external_id"],
            defaults={
                "title": item["title"],
                "category": item["category"],
                "internship_type": item["internship_type"],
                "city": item["city"],
                "country": item["country"],
                "description": item["description"],
                "status": "active",
                "is_verified": True,
                "needs_review": False,
            }
        )
        internship.required_skills.set(item["skills"])
        internship.embedding = get_embedding(build_internship_text_representation(internship))
        internship.save(update_fields=["embedding"])
        internships.append(internship)

    print(f"✓ Created and embedded {len(internships)} internships.")

    # -------------------------------------------------------------
    # 5. Execute pgvector Cosine Distance Query
    # -------------------------------------------------------------
    print("\n[Test 5] Executing pgvector Cosine Distance (<=>) Query via HNSW Index...")
    qs = (
        Internship.objects
        .filter(status="active")
        .annotate(cosine_dist=CosineDistance("embedding", profile1.embedding))
        .order_by("cosine_dist")
    )
    results = list(qs)
    assert len(results) >= 5, "pgvector query must return all active internships"
    for r in results:
        assert hasattr(r, "cosine_dist"), "Result must contain annotated cosine_dist"
        assert 0.0 <= r.cosine_dist <= 2.0, f"Cosine distance out of bounds: {r.cosine_dist}"
    print(f"✓ pgvector query executed directly in PostgreSQL without error. Nearest internship: '{results[0].title}' (dist={results[0].cosine_dist:.4f})")

    # -------------------------------------------------------------
    # 6. Verify 6-Factor Hybrid Scoring & XAI Generator
    # -------------------------------------------------------------
    print("\n[Test 6] Verifying 6-Factor Scoring Formula and XAI Output...")
    for student in [profile1, profile2, profile3]:
        for internship in internships:
            score_data = calculate_match_score(student, internship)
            
            # Assert all scores bounded in [0, 100]
            assert 0.0 <= score_data["skill_score"] <= 100.0, f"Skill score out of range: {score_data['skill_score']}"
            assert 0.0 <= score_data["education_score"] <= 100.0, f"Education score out of range: {score_data['education_score']}"
            assert 0.0 <= score_data["interest_score"] <= 100.0, f"Interest score out of range: {score_data['interest_score']}"
            assert 0.0 <= score_data["experience_score"] <= 100.0, f"Experience score out of range: {score_data['experience_score']}"
            assert 0.0 <= score_data["location_score"] <= 100.0, f"Location score out of range: {score_data['location_score']}"
            assert 0.0 <= score_data["work_mode_score"] <= 100.0, f"Work mode score out of range: {score_data['work_mode_score']}"
            assert 0.0 <= score_data["overall_score"] <= 100.0, f"Overall score out of range: {score_data['overall_score']}"
            assert 0.0 <= score_data["semantic_score"] <= 100.0, f"Semantic score out of range: {score_data['semantic_score']}"
            assert 0.0 <= score_data["final_score"] <= 100.0, f"Final score out of range: {score_data['final_score']}"

            # Assert XAI explanation bullets
            explanation = score_data["explanation"]
            assert isinstance(explanation, list), "Explanation must be a list"
            assert len(explanation) == 4, f"Explanation must contain 4 bullets, got {len(explanation)}: {explanation}"
            assert any("Matching skills" in b for b in explanation), "Missing skills bullet"
            assert any("prerequisite" in b.lower() for b in explanation), "Missing prerequisite bullet"
            assert any("Location" in b for b in explanation), "Missing location bullet"
            assert any("Major" in b for b in explanation), "Missing major bullet"

    print("✓ All 6 factors, overall deterministic formula, semantic boost, and 4 XAI bullets passed assertions.")

    # -------------------------------------------------------------
    # 7. Check Ranking Relevance
    # -------------------------------------------------------------
    print("\n[Test 7] Checking Profile Relevance Rankings...")
    # Student 1 (Backend Python) should rank Backend Python highest
    ranked_1 = get_ranked_recommendations(profile1, top_n=5)
    top_title_1 = ranked_1[0]["internship"].title
    print(f"  Student 1 Top Match: {top_title_1} (Score: {ranked_1[0]['score']})")
    assert "Backend Python" in top_title_1, f"Expected Backend Python for Student 1, got {top_title_1}"

    # Student 2 (Frontend React in Hawassa) should rank Frontend React highest
    ranked_2 = get_ranked_recommendations(profile2, top_n=5)
    top_title_2 = ranked_2[0]["internship"].title
    print(f"  Student 2 Top Match: {top_title_2} (Score: {ranked_2[0]['score']})")
    assert "Frontend React" in top_title_2, f"Expected Frontend React for Student 2, got {top_title_2}"

    # Student 3 (Cloud in Bahir Dar) should rank Cloud Infrastructure highest
    ranked_3 = get_ranked_recommendations(profile3, top_n=5)
    top_title_3 = ranked_3[0]["internship"].title
    print(f"  Student 3 Top Match: {top_title_3} (Score: {ranked_3[0]['score']})")
    assert "Cloud" in top_title_3, f"Expected Cloud for Student 3, got {top_title_3}"
    print("✓ Recommendations accurately align with domain, skills, and geographic preferences.")

    # -------------------------------------------------------------
    # 8. Celery Task Recalculation & Recommendation Table Persistence
    # -------------------------------------------------------------
    print("\n[Test 8] Testing Celery recalculate_student_matches_task...")
    task_res = recalculate_student_matches_task(profile1.id, top_n=5)
    assert task_res["status"] == "completed", f"Task did not complete: {task_res}"
    assert task_res["matches_count"] >= 5, f"Expected at least 5 matches, got {task_res['matches_count']}"

    db_recs = Recommendation.objects.filter(student=profile1.user)
    assert db_recs.count() >= 5, f"Expected at least 5 saved recommendations, got {db_recs.count()}"
    sample_rec = db_recs.first()
    assert float(sample_rec.overall_score) > 0, "Saved overall_score must be positive"
    assert sample_rec.explanation, "Saved explanation must not be empty"
    print(f"✓ Celery task persisted {db_recs.count()} recommendations for student {profile1.user.email} in database.")
    print(f"  Sample persisted record: {sample_rec}")
    print(f"  Explanation sample: {sample_rec.explanation[0]}")

    print("\n" + "=" * 70)
    print("ALL TESTS IN TASK 2.1 COMPLETED AND VERIFIED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()
