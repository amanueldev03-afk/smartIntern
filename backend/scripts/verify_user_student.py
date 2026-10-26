"""
Verification script for Task 1.2 — User & Student Models.

Tests:
1. User model with AbstractBaseUser + PermissionsMixin (Table 3.2).
2. Email as username, password hashing, role default to student, is_active.
3. Superuser creation with email and password.
4. Student model creation with all Table 3.3 fields.
5. user.student reverse relation access.
6. Cascade delete: deleting User deletes Student (Section 3.8.4 composition).
7. Non-cascade: deleting Student preserves User.
8. OneToOne uniqueness constraint.
9. TimeStampedModel inheritance on Student.
"""
import os
import sys
import datetime
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import IntegrityError, transaction
from apps.common.models import TimeStampedModel
from apps.students.models import Student

User = get_user_model()


def run_checks():
    print("=" * 60)
    print("TASK 1.2 VERIFICATION: User & Student Models")
    print("=" * 60)

    passed = 0
    total = 0

    def check(desc, condition):
        nonlocal passed, total
        total += 1
        if condition:
            print(f"  [PASS] {desc}")
            passed += 1
        else:
            print(f"  [FAIL] {desc}")
            raise AssertionError(f"Check failed: {desc}")

    # Clean up any leftover test data
    test_emails = [
        "verify_student1@example.com",
        "verify_student2@example.com",
        "verify_admin@example.com",
    ]
    User.objects.filter(email__in=test_emails).delete()

    try:
        # Check 1: User inheritance
        check(
            "User inherits AbstractBaseUser",
            issubclass(User, AbstractBaseUser),
        )
        check(
            "User inherits PermissionsMixin",
            issubclass(User, PermissionsMixin),
        )

        # Check 2: USERNAME_FIELD is 'email'
        check(
            "User.USERNAME_FIELD is 'email'",
            User.USERNAME_FIELD == "email",
        )

        # Check 3: Create normal user
        user = User.objects.create_user(
            email="verify_student1@example.com",
            password="SecurePassword123!",
            username="verifystudent",
        )
        check("User created successfully", user.id is not None)
        check("User email is correct", user.email == "verify_student1@example.com")
        check("User password was hashed", user.check_password("SecurePassword123!"))
        check("User role is STUDENT", user.role == User.Role.STUDENT)
        check("User is_active is True", user.is_active is True)
        check("User is_staff is False", user.is_staff is False)
        check("User is_superuser is False", user.is_superuser is False)

        # Check 4: Create superuser
        admin_user = User.objects.create_superuser(
            email="verify_admin@example.com",
            password="AdminPassword123!",
        )
        check("Admin created successfully", admin_user.id is not None)
        check("Admin role is ADMIN", admin_user.role == User.Role.ADMIN)
        check("Admin is_staff is True", admin_user.is_staff is True)
        check("Admin is_superuser is True", admin_user.is_superuser is True)

        # Check 5: Student model inheritance
        check(
            "Student inherits TimeStampedModel",
            issubclass(Student, TimeStampedModel),
        )
        check(
            "Student exists in apps.students.models",
            Student is not None,
        )

        # Check 6: Create Student with all Table 3.3 fields
        student = Student.objects.create(
            user=user,
            education_level="bachelor",
            field_of_study="Computer Engineering",
            university="Addis Ababa University",
            current_year="Final Year",
            experience_level="intermediate",
            preferred_country="Ethiopia",
            preferred_city="Addis Ababa",
            work_mode="hybrid",
            internship_type="full_time",
            availability_start=datetime.date(2026, 9, 1),
            availability_end=datetime.date(2027, 3, 1),
        )
        check("Student created successfully", student.id is not None)
        check("Student education_level is 'bachelor'", student.education_level == "bachelor")
        check("Student field_of_study is correct", student.field_of_study == "Computer Engineering")
        check("Student university is correct", student.university == "Addis Ababa University")
        check("Student current_year is correct", student.current_year == "Final Year")
        check("Student experience_level is 'intermediate'", student.experience_level == "intermediate")
        check("Student preferred_country is 'Ethiopia'", student.preferred_country == "Ethiopia")
        check("Student preferred_city is 'Addis Ababa'", student.preferred_city == "Addis Ababa")
        check("Student work_mode is 'hybrid'", student.work_mode == "hybrid")
        check("Student internship_type is 'full_time'", student.internship_type == "full_time")
        check("Student availability_start is correct", str(student.availability_start) == "2026-09-01")
        check("Student availability_end is correct", str(student.availability_end) == "2027-03-01")
        check("Student created_at is populated", student.created_at is not None)
        check("Student updated_at is populated", student.updated_at is not None)

        # Check 7: Reverse relationship: user.student
        user_from_db = User.objects.get(id=user.id)
        check("user.student works and returns Student instance", user_from_db.student == student)
        check("student.user returns User instance", student.user == user_from_db)

        # Check 8: OneToOne Uniqueness
        try:
            with transaction.atomic():
                Student.objects.create(
                    user=user,
                    university="Harvard",
                )
            unique_failed = False
        except IntegrityError:
            unique_failed = True
        check("OneToOne constraint enforces 1 Student per User", unique_failed)

        # Check 9: Non-cascade when deleting Student
        user2 = User.objects.create_user(
            email="verify_student2@example.com",
            password="Password456!",
        )
        student2 = Student.objects.create(
            user=user2,
            university="Stanford",
        )
        student2_id = student2.id
        student2.delete()
        check("Deleting Student does NOT delete User", User.objects.filter(id=user2.id).exists())
        check("Student row was deleted", not Student.objects.filter(id=student2_id).exists())

        # Check 10: Cascade delete when deleting User (Composition: Section 3.8.4)
        user_id = user.id
        student_id = student.id
        user.delete()
        check("Deleting User cascade-deletes Student", not Student.objects.filter(id=student_id).exists())
        check("User row was deleted", not User.objects.filter(id=user_id).exists())

    finally:
        # Cleanup
        User.objects.filter(email__in=test_emails).delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
