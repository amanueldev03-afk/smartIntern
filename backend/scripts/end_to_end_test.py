#!/usr/bin/env python
import os
import django
import requests
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.students.models import StudentProfile, Skill
from apps.internships.models import Internship, InternshipSource
from apps.companies.models import Company

BASE_URL = "http://localhost:8001"

User = get_user_model()

print("=" * 60)
print("END-TO-END BUSINESS LOGIC TEST")
print("=" * 60)

# Step 1: Setup test users
print("\n[STEP 1] Setting up test users...")
try:
    admin = User.objects.get(email='admin@endtoend.com')
    admin.set_password('AdminPass123!')
    admin.role = 'admin'
    admin.is_staff = True
    admin.is_superuser = True
    admin.is_active = True
    admin.is_email_verified = True  # Bypass email verification
    admin.save()
    print("✅ Admin user ready: admin@endtoend.com")
except User.DoesNotExist:
    admin = User.objects.create_user('adminuser', 'admin@endtoend.com', 'AdminPass123!')
    admin.role = 'admin'
    admin.is_staff = True
    admin.is_superuser = True
    admin.is_active = True
    admin.is_email_verified = True
    admin.save()
    print("✅ Admin user created: admin@endtoend.com")

try:
    student = User.objects.get(email='student@endtoend.com')
    student.set_password('StudentPass123!')
    student.role = 'student'
    student.is_active = True
    student.is_email_verified = True  # Bypass email verification
    student.save()
    print("✅ Student user ready: student@endtoend.com")
except User.DoesNotExist:
    student = User.objects.create_user('student123', 'student@endtoend.com', 'StudentPass123!')
    student.role = 'student'
    student.is_active = True
    student.is_email_verified = True
    student.save()
    print("✅ Student user created: student@endtoend.com")

# Step 2: Admin Login
print("\n[STEP 2] Admin Login...")
login_response = requests.post(f"{BASE_URL}/api/auth/login/", json={
    "email": "admin@endtoend.com",
    "password": "AdminPass123!"
})
print(f"Login response status: {login_response.status_code}")
if login_response.status_code == 200:
    admin_token = login_response.json().get('access')
    print(f"✅ Admin logged in successfully")
    admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
else:
    print(f"❌ Admin login failed: {login_response.text}")
    admin_headers = {}

# Step 3: Get or Create Company
print("\n[STEP 3] Get or Create Company...")
existing_company = Company.objects.filter(name="Tech Corp").first()
if existing_company:
    company_id = existing_company.id
    print(f"✅ Company exists: Tech Corp (ID: {company_id})")
else:
    company_response = requests.post(f"{BASE_URL}/api/companies/",
        headers=admin_headers,
        json={
            "name": "Tech Corp Test",
            "website": "https://techcorp.com",
            "description": "A technology company",
            "industry": "Technology"
        }
    )
    print(f"Company creation status: {company_response.status_code}")
    if company_response.status_code == 201:
        company_data = company_response.json()
        company_id = company_data.get('id')
        print(f"✅ Company created: ID {company_id}")
    else:
        print(f"Company response: {company_response.text}")
        # Use existing company
        any_company = Company.objects.first()
        company_id = any_company.id if any_company else 1
        print(f"Using existing company ID: {company_id}")

# Step 4: Create Data Source
print("\n[STEP 4] Create Data Source...")
source_response = requests.post(f"{BASE_URL}/api/internships/admin/sources/",
    headers=admin_headers,
    json={
        "name": "LinkedIn Test",
        "url": "https://linkedin.com",
        "source_type": "api"
    }
)
print(f"Source creation status: {source_response.status_code}")
if source_response.status_code == 201:
    source_data = source_response.json()
    source_id = source_data.get('id')
    print(f"✅ Data Source created: ID {source_id}")
else:
    print(f"Source response: {source_response.text}")
    # Use existing source
    any_source = InternshipSource.objects.first()
    source_id = any_source.id if any_source else 1
    print(f"Using existing source ID: {source_id}")

# Step 5: Get or Create Skills
print("\n[STEP 5] Get or Create Skills...")
skills_to_create = [
    {"name": "Python", "category": "Programming Languages"},
    {"name": "JavaScript", "category": "Programming Languages"},
    {"name": "Machine Learning", "category": "AI/ML"},
    {"name": "React", "category": "Frameworks"},
    {"name": "Django", "category": "Frameworks"}
]

skill_ids = []
# First, try to get all existing skills from database
all_skills = Skill.objects.all()
print(f"Found {all_skills.count()} existing skills in database")

# Get specific skills we need
for skill_data in skills_to_create:
    existing_skill = Skill.objects.filter(name=skill_data['name']).first()
    if existing_skill:
        skill_ids.append(existing_skill.id)
        print(f"✅ Skill exists: {skill_data['name']} (ID: {existing_skill.id})")

# If we don't have enough skills, create them via API
if len(skill_ids) < 5 and admin_headers:
    for skill_data in skills_to_create:
        if Skill.objects.filter(name=skill_data['name']).exists():
            continue
        skill_response = requests.post(f"{BASE_URL}/api/internships/admin/skills/",
            headers=admin_headers,
            json=skill_data
        )
        if skill_response.status_code == 201:
            skill_id = skill_response.json().get('id')
            skill_ids.append(skill_id)
            print(f"✅ Skill created via API: {skill_data['name']} (ID: {skill_id})")

# If still not enough, use any available skills
if len(skill_ids) < 5:
    remaining_skills = Skill.objects.exclude(id__in=skill_ids)[:5-len(skill_ids)]
    for skill in remaining_skills:
        skill_ids.append(skill.id)
        print(f"✅ Using additional skill: {skill.name} (ID: {skill.id})")

print(f"Total skills available: {len(skill_ids)}")
if len(skill_ids) < 2:
    print("⚠️ Warning: Not enough skills for internship creation")
    # Create dummy skill IDs for testing
    skill_ids = [1, 2, 3, 4, 5]

# Step 6: Use Existing Internships
print("\n[STEP 6] Use Existing Internships...")
existing_internships = Internship.objects.filter(status='active', is_verified=True)[:3]
if existing_internships.exists():
    internship_ids = [i.id for i in existing_internships]
    print(f"✅ Using {len(internship_ids)} existing active internships")
    for internship in existing_internships:
        print(f"  - {internship.title} (ID: {internship.id})")
else:
    print("⚠️ No active internships found")
    internship_ids = [29, 31, 32]  # Use known IDs from admin dashboard

# Step 7: Student Login
print("\n[STEP 7] Student Login...")
student_login_response = requests.post(f"{BASE_URL}/api/auth/login/", json={
    "email": "student@endtoend.com",
    "password": "StudentPass123!"
})
print(f"Student login status: {student_login_response.status_code}")
if student_login_response.status_code == 200:
    student_token = student_login_response.json().get('access')
    print(f"✅ Student logged in successfully")
    student_headers = {"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"}
else:
    print(f"❌ Student login failed: {student_login_response.text}")
    student_headers = {}

# Step 8: Create Student Profile
print("\n[STEP 8] Create Student Profile...")
profile_response = requests.patch(f"{BASE_URL}/api/students/me/",
    headers=student_headers,
    json={
        "full_name": "Test Student",
        "bio": "Computer Science student interested in AI",
        "education_level": "bachelor",
        "field_of_study": "CS",  # Use valid field of study code
        "university": "Tech University",
        "skills": skill_ids[:3],  # Python, JavaScript, ML
        "interests": ["Machine Learning", "Web Development"]
    }
)
print(f"Profile creation status: {profile_response.status_code}")
if profile_response.status_code == 200:
    print(f"✅ Student profile created")
else:
    print(f"Profile response: {profile_response.text}")
    # Try without field_of_study
    profile_response = requests.patch(f"{BASE_URL}/api/students/me/",
        headers=student_headers,
        json={
            "full_name": "Test Student",
            "bio": "Computer Science student interested in AI",
            "education_level": "bachelor",
            "university": "Tech University"
        }
    )
    if profile_response.status_code == 200:
        print(f"✅ Student profile created (minimal)")

# Step 9: Get Recommendations
print("\n[STEP 9] Get Recommendations...")
recommendations_response = requests.get(f"{BASE_URL}/api/recommendations/",
    headers=student_headers
)
print(f"Recommendations status: {recommendations_response.status_code}")
if recommendations_response.status_code == 200:
    recommendations = recommendations_response.json()
    print(f"✅ Recommendations retrieved")
    print(f"Number of recommendations: {len(recommendations.get('results', []))}")
    if recommendations.get('results'):
        for rec in recommendations['results'][:3]:
            print(f"  - {rec.get('title', 'N/A')} (Score: {rec.get('score', 'N/A')})")
else:
    print(f"Recommendations response: {recommendations_response.text}")

# Step 10: Save Internship
print("\n[STEP 10] Save Internship...")
if internship_ids:
    save_response = requests.post(f"{BASE_URL}/api/internships/saved/add/",
        headers=student_headers,
        json={"internship_id": internship_ids[0]}
    )
    print(f"Save internship status: {save_response.status_code}")
    if save_response.status_code == 201:
        print(f"✅ Internship saved")
    else:
        print(f"Save response: {save_response.text}")

# Step 11: Apply to Internship
print("\n[STEP 11] Apply to Internship...")
if internship_ids:
    apply_response = requests.post(f"{BASE_URL}/api/internships/applications/add/",
        headers=student_headers,
        json={
            "internship": internship_ids[0],
            "cover_letter": "I am very interested in this position"
        }
    )
    print(f"Application status: {apply_response.status_code}")
    if apply_response.status_code == 201:
        print(f"✅ Application submitted")
    else:
        print(f"Application response: {apply_response.text}")

# Step 12: Submit Feedback (skip if no recommendations)
print("\n[STEP 12] Submit Feedback...")
if internship_ids:
    # Try to get recommendations first
    rec_response = requests.get(f"{BASE_URL}/api/recommendations/", headers=student_headers)
    if rec_response.status_code == 200:
        rec_data = rec_response.json()
        if rec_data.get('results'):
            feedback_response = requests.post(f"{BASE_URL}/api/recommendations/{rec_data['results'][0]['id']}/feedback/",
                headers=student_headers,
                json={"action": "applied"}
            )
            print(f"Feedback status: {feedback_response.status_code}")
            if feedback_response.status_code == 200:
                print(f"✅ Feedback submitted")
            else:
                print(f"Feedback response: {feedback_response.text}")
        else:
            print("⚠️ No recommendations to submit feedback for")
    else:
        print("⚠️ Could not get recommendations for feedback")

# Step 13: Student Dashboard
print("\n[STEP 13] Student Dashboard...")
dashboard_response = requests.get(f"{BASE_URL}/api/internships/dashboard/",
    headers=student_headers
)
print(f"Student dashboard status: {dashboard_response.status_code}")
if dashboard_response.status_code == 200:
    dashboard_data = dashboard_response.json()
    print(f"✅ Student dashboard retrieved")
    print(f"Stats: {dashboard_data}")
else:
    print(f"Dashboard response: {dashboard_response.text}")

# Step 14: Admin Dashboard
print("\n[STEP 14] Admin Dashboard...")
admin_dashboard_response = requests.get(f"{BASE_URL}/api/internships/admin/dashboard/",
    headers=admin_headers
)
print(f"Admin dashboard status: {admin_dashboard_response.status_code}")
if admin_dashboard_response.status_code == 200:
    admin_dashboard_data = admin_dashboard_response.json()
    print(f"✅ Admin dashboard retrieved")
    print(f"Stats: {admin_dashboard_data}")
else:
    print(f"Admin dashboard response: {admin_dashboard_response.text}")

print("\n" + "=" * 60)
print("END-TO-END TEST COMPLETE")
print("=" * 60)
