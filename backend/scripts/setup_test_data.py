#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.students.models import StudentProfile, Skill
from apps.internships.models import Internship, InternshipSource
from apps.companies.models import Company

User = get_user_model()

# Create admin user
try:
    admin = User.objects.create_user(
        username='adminuser',
        email='admin@endtoend.com',
        password='AdminPass123!'
    )
    admin.role = 'admin'
    admin.is_staff = True
    admin.is_superuser = True
    admin.save()
    print(f"✅ Admin created: {admin.email}")
except Exception as e:
    print(f"Admin already exists or error: {e}")
    admin = User.objects.filter(email='admin@endtoend.com').first()

# Create student user and verify email
try:
    student = User.objects.create_user(
        username='student123',
        email='student@endtoend.com',
        password='StudentPass123!'
    )
    student.role = 'student'
    student.is_active = True  # Skip email verification for testing
    student.save()
    print(f"✅ Student created and verified: {student.email}")
except Exception as e:
    print(f"Student already exists or error: {e}")
    student = User.objects.filter(email='student@endtoend.com').first()
    if student:
        student.is_active = True
        student.role = 'student'
        student.save()
        print(f"✅ Student activated: {student.email}")

print(f"\nAdmin credentials: admin@endtoend.com / AdminPass123!")
print(f"Student credentials: student@endtoend.com / StudentPass123!")
