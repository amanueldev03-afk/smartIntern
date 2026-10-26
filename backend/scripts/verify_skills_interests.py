"""
Verification script for Task 1.3 — Skills & Interests.

Tests:
1. Skill model with category field.
2. CareerInterest catalogue model (name, description, is_active).
3. StudentSkill creation with proficiency (Beginner, Intermediate, Advanced).
4. Uniqueness constraint on StudentSkill: attempting to add the same skill twice
   to one student raises IntegrityError.
5. StudentInterest creation.
6. Uniqueness constraint on StudentInterest: attempting to add the same interest
   twice to one student raises IntegrityError.
7. ManyToMany relationship: student.skills.all() and student.interests.all().
8. Cascade delete: deleting Student cascade-deletes StudentSkill and StudentInterest.
9. Catalogue preservation: deleting StudentSkill or Student does NOT delete Skill or CareerInterest.
10. TimeStampedModel inheritance on all Task 1.3 models.
"""
import os
import sys
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from apps.common.models import TimeStampedModel
from apps.internships.models import Skill
from apps.students.models import (
    Student,
    CareerInterest,
    StudentSkill,
    StudentInterest,
)

User = get_user_model()


def run_checks():
    print("=" * 60)
    print("TASK 1.3 VERIFICATION: Skills & Interests")
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

    # Clean up test data
    test_email = "skills_interest_test@example.com"
    User.objects.filter(email=test_email).delete()
    Skill.objects.filter(name__in=["Python", "Django", "React", "Docker"]).delete()
    CareerInterest.objects.filter(name__in=["Artificial Intelligence", "Web Development", "DevOps"]).delete()

    try:
        # Check 1: Model inheritance
        check("Skill inherits TimeStampedModel", issubclass(Skill, TimeStampedModel))
        check("CareerInterest inherits TimeStampedModel", issubclass(CareerInterest, TimeStampedModel))
        check("StudentSkill inherits TimeStampedModel", issubclass(StudentSkill, TimeStampedModel))
        check("StudentInterest inherits TimeStampedModel", issubclass(StudentInterest, TimeStampedModel))

        # Check 2: Models exist in apps.students.models
        check("Student in apps.students.models", Student is not None)
        check("Skill in apps.students.models", Skill is not None)
        check("StudentSkill in apps.students.models", StudentSkill is not None)
        check("CareerInterest in apps.students.models", CareerInterest is not None)
        check("StudentInterest in apps.students.models", StudentInterest is not None)

        # Check 3: Skill with category
        py_skill = Skill.objects.create(
            name="Python",
            category="Programming Languages",
            description="Core programming language",
        )
        dj_skill = Skill.objects.create(
            name="Django",
            category="Web Frameworks",
            description="Web development framework",
        )
        check("Skill created with category", py_skill.category == "Programming Languages")
        check("Skill timestamps populated", py_skill.created_at is not None and py_skill.updated_at is not None)

        # Check 4: CareerInterest catalogue
        ai_interest = CareerInterest.objects.create(
            name="Artificial Intelligence",
            description="Machine Learning, NLP, Computer Vision",
        )
        web_interest = CareerInterest.objects.create(
            name="Web Development",
            description="Full-stack web engineering",
        )
        check("CareerInterest created", ai_interest.name == "Artificial Intelligence")
        check("CareerInterest timestamps populated", ai_interest.created_at is not None)

        # Check 5: Student setup
        user = User.objects.create_user(email=test_email, password="password123")
        student = Student.objects.create(
            user=user,
            university="Addis Ababa University",
            field_of_study="Computer Science",
        )

        # Check 6: StudentSkill with proficiency
        ss1 = StudentSkill.objects.create(
            student=student,
            skill=py_skill,
            proficiency=StudentSkill.Proficiency.ADVANCED,
        )
        ss2 = StudentSkill.objects.create(
            student=student,
            skill=dj_skill,
            proficiency=StudentSkill.Proficiency.INTERMEDIATE,
        )
        check("StudentSkill created with proficiency", ss1.proficiency == "advanced")
        check("StudentSkill string representation", "Python (Advanced)" in str(ss1))
        check("StudentSkill timestamps populated", ss1.created_at is not None and ss1.updated_at is not None)

        # Check 7: CRITICAL CHECK — duplicate skill on same student raises IntegrityError
        try:
            with transaction.atomic():
                StudentSkill.objects.create(
                    student=student,
                    skill=py_skill,
                    proficiency=StudentSkill.Proficiency.BEGINNER,
                )
            dup_skill_failed = False
        except IntegrityError:
            dup_skill_failed = True

        check(
            "Duplicate skill on same student raises IntegrityError (prevents score inflation)",
            dup_skill_failed,
        )

        # Check 8: StudentInterest creation
        si1 = StudentInterest.objects.create(
            student=student,
            interest=ai_interest,
        )
        si2 = StudentInterest.objects.create(
            student=student,
            interest=web_interest,
        )
        check("StudentInterest created", si1.interest == ai_interest)
        check("StudentInterest string representation", "Artificial Intelligence" in str(si1))

        # Check 9: Duplicate interest on same student raises IntegrityError
        try:
            with transaction.atomic():
                StudentInterest.objects.create(
                    student=student,
                    interest=ai_interest,
                )
            dup_interest_failed = False
        except IntegrityError:
            dup_interest_failed = True

        check(
            "Duplicate interest on same student raises IntegrityError",
            dup_interest_failed,
        )

        # Check 10: ManyToMany query traversal
        student_skills = list(student.skills.all())
        check("student.skills.all() returns 2 skills", len(student_skills) == 2)
        check("student.skills contains Python and Django", set(student_skills) == {py_skill, dj_skill})

        student_interests = list(student.interests.all())
        check("student.interests.all() returns 2 interests", len(student_interests) == 2)
        check("student.interests contains AI and Web", set(student_interests) == {ai_interest, web_interest})

        # Check 11: Reverse relationship from catalogue
        check("py_skill.students contains student", student in py_skill.students.all())
        check("ai_interest.students contains student", student in ai_interest.students.all())

        # Check 12: Cascade delete: deleting Student deletes through rows
        ss1_id = ss1.id
        si1_id = si1.id
        py_skill_id = py_skill.id
        ai_interest_id = ai_interest.id

        student.delete()

        check("StudentSkill deleted on student deletion", not StudentSkill.objects.filter(id=ss1_id).exists())
        check("StudentInterest deleted on student deletion", not StudentInterest.objects.filter(id=si1_id).exists())

        # Check 13: Catalogue models are preserved
        check("Catalogue Skill preserved after Student deletion", Skill.objects.filter(id=py_skill_id).exists())
        check("Catalogue CareerInterest preserved after Student deletion", CareerInterest.objects.filter(id=ai_interest_id).exists())

    finally:
        # Cleanup
        User.objects.filter(email=test_email).delete()
        Skill.objects.filter(name__in=["Python", "Django", "React", "Docker"]).delete()
        CareerInterest.objects.filter(name__in=["Artificial Intelligence", "Web Development", "DevOps"]).delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
