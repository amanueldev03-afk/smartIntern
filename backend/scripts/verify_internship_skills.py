"""
Verification script for Task 1.5 — Internship & InternshipSkill Models.

Tests:
1. Internship model with company FK, data_source FK (nullable), country, city,
   required_education, required_experience, internship_type, work_mode,
   salary (nullable), deadline, source_url, application_url, posted_date,
   status (active/expired/removed), external_id, and content_hash.
2. InternshipSkill model with Internship FK, Skill FK, unique_together.
3. Check: Create one Internship with 3 InternshipSkills in shell; confirm
   internship.internshipskill_set.count() == 3.
4. Integrity check: Attempting to add duplicate InternshipSkill on same internship
   raises IntegrityError.
5. Deletion cascade: Deleting Internship deletes InternshipSkill rows but preserves
   catalogue Skill rows.
"""
import os
import sys
import hashlib
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import IntegrityError, transaction
from django.utils import timezone
from apps.common.models import TimeStampedModel
from apps.companies.models import Company
from apps.data_sources.models import DataSource
from apps.internships.models import (
    Internship,
    InternshipSkill,
    Skill,
)


def run_checks():
    print("=" * 60)
    print("TASK 1.5 VERIFICATION: Internship & InternshipSkill Models")
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
    Company.objects.filter(name="DeepMind Technologies").delete()
    DataSource.objects.filter(name="AI Jobs RSS").delete()
    Internship.objects.filter(title__in=["AI Research Intern", "Direct Company Internship"]).delete()
    Skill.objects.filter(name__in=["PyTorch", "JAX", "Transformers", "Reinforcement Learning"]).delete()

    try:
        # Check 1: Model inheritance
        check("Internship inherits TimeStampedModel", issubclass(Internship, TimeStampedModel))
        check("InternshipSkill inherits TimeStampedModel", issubclass(InternshipSkill, TimeStampedModel))

        # Check 2: Setup Company and DataSource
        company = Company.objects.create(
            name="DeepMind Technologies",
            website="https://deepmind.google",
            country="United Kingdom",
            industry="Artificial Intelligence",
        )
        data_source = DataSource.objects.create(
            name="AI Jobs RSS",
            type=DataSource.Type.RSS,
            base_url="https://deepmind.google/careers/feed.xml",
        )

        # Check 3: Setup Skills
        skill1 = Skill.objects.create(name="PyTorch", category="Machine Learning")
        skill2 = Skill.objects.create(name="JAX", category="Machine Learning")
        skill3 = Skill.objects.create(name="Transformers", category="NLP")
        skill4 = Skill.objects.create(name="Reinforcement Learning", category="AI")

        # Check 4: Create Internship with all Task 1.5 fields
        content_raw = f"AI Research Intern|{company.name}|Research advanced multi-agent reinforcement learning architectures."
        content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()

        internship = Internship.objects.create(
            title="AI Research Intern",
            company=company,
            data_source=data_source,
            organization_name=company.name,
            description="Research advanced multi-agent reinforcement learning architectures.",
            country="United Kingdom",
            city="London",
            required_education="Master",
            required_experience="Intermediate",
            internship_type="hybrid",
            work_mode="hybrid",
            salary=6500.00,
            deadline=timezone.now() + timezone.timedelta(days=60),
            source_url="https://deepmind.google/careers/jobs/1234",
            application_url="https://deepmind.google/apply/1234",
            posted_date=timezone.now(),
            status=Internship.STATUS_ACTIVE,
            external_id="DM-JOB-1234",
            content_hash=content_hash,
        )

        check("Internship created successfully", internship.id is not None)
        check("Internship company FK works", internship.company == company)
        check("Internship data_source FK works", internship.data_source == data_source)
        check("Internship country is UK", internship.country == "United Kingdom")
        check("Internship city is London", internship.city == "London")
        check("Internship required_education is Master", internship.required_education == "Master")
        check("Internship required_experience is Intermediate", internship.required_experience == "Intermediate")
        check("Internship work_mode is hybrid", internship.work_mode == "hybrid")
        check("Internship salary is 6500.00", float(internship.salary) == 6500.00)
        check("Internship content_hash is populated", len(internship.content_hash) == 64)
        check("Internship external_id is DM-JOB-1234", internship.external_id == "DM-JOB-1234")
        check("Internship status is active", internship.status == Internship.STATUS_ACTIVE)

        # Check 5: Company-direct listing has data_source as None
        direct_internship = Internship.objects.create(
            title="Direct Company Internship",
            company=company,
            data_source=None,  # Nullable
            organization_name=company.name,
            description="Direct employer listing without third-party source.",
            application_url="https://deepmind.google/apply/direct",
            internship_type="remote",
            status=Internship.STATUS_ACTIVE,
        )
        check("Company-direct listing allows data_source=None", direct_internship.data_source is None)

        # Check 6: SPECIFIC TASK CHECK — Create one Internship with 3 InternshipSkills
        # Confirm internship.internshipskill_set.count() == 3
        is1 = InternshipSkill.objects.create(internship=internship, skill=skill1)
        is2 = InternshipSkill.objects.create(internship=internship, skill=skill2)
        is3 = InternshipSkill.objects.create(internship=internship, skill=skill3)

        check(
            "CRITICAL CHECK: internship.internshipskill_set.count() == 3",
            internship.internshipskill_set.count() == 3,
        )
        check("InternshipSkill timestamps populated", is1.created_at is not None)
        check("InternshipSkill string representation", "AI Research Intern - PyTorch" in str(is1))

        # Check 7: Duplicate skill on same internship raises IntegrityError
        try:
            with transaction.atomic():
                InternshipSkill.objects.create(internship=internship, skill=skill1)
            dup_skill_failed = False
        except IntegrityError:
            dup_skill_failed = True

        check("Duplicate InternshipSkill raises IntegrityError", dup_skill_failed)

        # Check 8: Reverse query from Skill
        skill1_internships = list(Internship.objects.filter(internshipskill__skill=skill1))
        check("Skill queries find linked internships", internship in skill1_internships)

        # Check 9: Cascade delete: deleting Internship deletes InternshipSkill but preserves Skill
        internship_id = internship.id
        skill1_id = skill1.id
        is1_id = is1.id

        internship.delete()

        check("InternshipSkill deleted on Internship deletion", not InternshipSkill.objects.filter(id=is1_id).exists())
        check("Catalogue Skill preserved after Internship deletion", Skill.objects.filter(id=skill1_id).exists())

    finally:
        # Cleanup
        Company.objects.filter(name="DeepMind Technologies").delete()
        DataSource.objects.filter(name="AI Jobs RSS").delete()
        Internship.objects.filter(title__in=["AI Research Intern", "Direct Company Internship"]).delete()
        Skill.objects.filter(name__in=["PyTorch", "JAX", "Transformers", "Reinforcement Learning"]).delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
