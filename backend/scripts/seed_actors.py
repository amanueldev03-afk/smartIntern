#!/usr/bin/env python
import os
import sys
import django

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

DEFAULT_PASSWORD = "Password123!"

ACTORS = [
    {
        "username": "student1",
        "email": "amanueldev03@gmail.com",
        "role": User.Role.STUDENT,
        "first_name": "Amanuel",
        "last_name": "Student",
    },
    {
        "username": "admin1",
        "email": "admin1@smartintern.et",
        "role": User.Role.ADMIN,
        "first_name": "System",
        "last_name": "Admin",
        "password": "Admin@1234",
        "is_staff": True,
        "is_superuser": True,
    },
    {
        "username": "advisor1",
        "email": "amanmuluken1621@gmail.com",
        "role": User.Role.ADVISOR,
        "first_name": "Dr. Muluken",
        "last_name": "Advisor",
    },
    {
        "username": "company_hr1",
        "email": "amanmuluken17@gmail.com",
        "role": User.Role.COMPANY_HR,
        "first_name": "TechCorp",
        "last_name": "HR Manager",
    },
    {
        "username": "mentor1",
        "email": "mentor@smartintern.et",
        "role": User.Role.COMPANY_MENTOR,
        "first_name": "TechCorp",
        "last_name": "Lead Mentor",
    },
    {
        "username": "dean1",
        "email": "dean@smartintern.et",
        "role": User.Role.DEPT_DEAN,
        "first_name": "Dean",
        "last_name": "Engineering",
        "university_name": "Addis Ababa University",
        "department": "Software Engineering",
        "staff_id_number": "AAU/DEAN/001",
    },
    {
        "username": "uil1",
        "email": "uil@smartintern.et",
        "role": User.Role.UIL_OFFICER,
        "first_name": "UIL",
        "last_name": "Head Officer",
        "university_name": "Addis Ababa University",
        "staff_id_number": "AAU/UIL/001",
    },
    {
        "username": "union1",
        "email": "union@smartintern.et",
        "role": User.Role.STUDENT_UNION,
        "first_name": "Student",
        "last_name": "Union Rep",
        "university_name": "Addis Ababa University",
        "staff_id_number": "AAU/UNION/001",
    },
    {
        "username": "dorm1",
        "email": "dorm@smartintern.et",
        "role": User.Role.DORM_ADMIN,
        "first_name": "Dormitory",
        "last_name": "Administrator",
        "university_name": "Addis Ababa University",
        "staff_id_number": "AAU/DORM/001",
    },
    {
        "username": "finance1",
        "email": "finance@smartintern.et",
        "role": User.Role.FINANCE_OFFICER,
        "first_name": "Finance",
        "last_name": "Officer",
        "university_name": "Addis Ababa University",
        "staff_id_number": "AAU/FIN/001",
    },
]

print("=== SEEDING ACTOR ACCOUNTS ===")
from apps.uil_profiles.models import StaffProfile, UniversityDepartment

for actor_data in ACTORS:
    email = actor_data["email"]
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "role": actor_data["role"],
            "first_name": actor_data["first_name"],
            "last_name": actor_data["last_name"],
            "username": actor_data.get("username"),
            "university_name": actor_data.get("university_name", ""),
            "department": actor_data.get("department", ""),
            "staff_id_number": actor_data.get("staff_id_number", ""),
            "is_active": True,
            "is_email_verified": True,
            "is_approved": True,
            "is_staff": actor_data.get("is_staff", False),
            "is_superuser": actor_data.get("is_superuser", False),
        }
    )

    user.role = actor_data["role"]
    if actor_data.get("username"):
        user.username = actor_data["username"]
    user.first_name = actor_data["first_name"]
    user.last_name = actor_data["last_name"]
    if actor_data.get("university_name"):
        user.university_name = actor_data["university_name"]
    if actor_data.get("department"):
        user.department = actor_data["department"]
    if actor_data.get("staff_id_number"):
        user.staff_id_number = actor_data["staff_id_number"]
    user.is_active = True
    user.is_email_verified = True
    user.is_approved = True
    if actor_data.get("is_staff"):
        user.is_staff = True
    if actor_data.get("is_superuser"):
        user.is_superuser = True
    pwd = actor_data.get("password", DEFAULT_PASSWORD)
    user.set_password(pwd)
    user.save()

    # Link StaffProfile if institutional role
    if user.role in (User.Role.DEPT_DEAN, User.Role.UIL_OFFICER, User.Role.STUDENT_UNION, User.Role.DORM_ADMIN, User.Role.ADVISOR, User.Role.FINANCE_OFFICER):
        dept_obj = None
        if user.university_name:
            dept_obj, _ = UniversityDepartment.objects.get_or_create(
                university_name=user.university_name,
                department_name=user.department or "General Department",
            )
        staff_prof, _ = StaffProfile.objects.get_or_create(user=user)
        staff_prof.staff_role = user.role
        staff_prof.department = dept_obj
        staff_prof.staff_id_number = user.staff_id_number or ""
        staff_prof.save()

    print(f"Configured actor: {user.username} ({user.email}) -> {user.role} with password '{pwd}'")

print("=== SEEDING COMPLETE ===")
