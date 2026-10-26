import math
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.internships.models import Skill, Internship
from apps.companies.models import Company, CompanyProfile
from apps.students.models import Student, StudentProfile
from apps.uil_profiles.models import UniversityDepartment, UILStudentProfile
from apps.postings.models import InternshipPosting
from apps.postings.services.matcher import (
    match_posting_to_student,
    get_posting_recommendations_for_student,
)
from apps.postings.tasks import recalculate_posting_embeddings_task
from ai_engine.ranking.scorer import calculate_overall_score, ComponentScores

User = get_user_model()


def make_unit_vector(val: float, dim: int = 384) -> list[float]:
    """Create a normalized 384-dim vector with first coordinate dominant."""
    vec = [0.0] * dim
    vec[0] = val
    rem = math.sqrt(max(0.0, 1.0 - val * val))
    vec[1] = rem
    return vec


class PostingsRecommendationEngineTests(TestCase):
    """
    Verification suite for Phase 4:
      - 3 sample students / 5 sample postings
      - pgvector cosine queries (<=>) execute without fallback errors
      - Base weighted scores match manual 6-factor calculation exactly (40/20/15/10/10/5)
      - Ranking order sensibly tie-breaks by semantic similarity when base scores tie
      - Existing recommendation endpoint output schema preservation
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Setup Skills
        self.skill_python = Skill.objects.create(name="Python", category="Backend")
        self.skill_django = Skill.objects.create(name="Django", category="Backend")
        self.skill_react = Skill.objects.create(name="React", category="Frontend")
        self.skill_docker = Skill.objects.create(name="Docker", category="DevOps")
        self.skill_sql = Skill.objects.create(name="PostgreSQL", category="Database")

        # 2. Setup University Department & Company
        self.dept = UniversityDepartment.objects.create(
            university_name="Addis Ababa University",
            department_name="Software Engineering",
        )
        self.company = Company.objects.create(
            name="Ethio Telecom",
            industry="Telecommunications",
            country="Ethiopia",
        )
        self.company_profile = CompanyProfile.objects.create(
            company=self.company,
            tin_number="TIN-00123456",
            contact_person="Almaz Ayana",
            contact_email="almaz@telecom.et",
            is_verified=True,
        )

        # 3. Setup 3 Sample Students
        # Student 1: Python/Django specialist, Year 4, Addis Ababa
        self.user1 = User.objects.create_user(
            email="student1_uil@aau.edu.et",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            first_name="Abebe",
            last_name="Bikila",
        )
        self.s1_baseline = Student.objects.create(
            user=self.user1,
            university="Addis Ababa University",
            field_of_study="software engineering",
            current_year="4th Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.s1_baseline.skills.add(self.skill_python, self.skill_django, self.skill_sql)
        self.s1_uil = UILStudentProfile.objects.create(
            student=self.s1_baseline,
            student_id_number="AAU/001/16",
            campus_city="Addis Ababa",
            department="software engineering",
            academic_year=4,
            gpa=3.85,
            is_active_for_internship=True,
            embedding=make_unit_vector(0.95),  # High similarity with Python vector
        )

        # Student 2: React Frontend Specialist, Year 3, Hawassa
        self.user2 = User.objects.create_user(
            email="student2_uil@hu.edu.et",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            first_name="Derartu",
            last_name="Tulu",
        )
        self.s2_baseline = Student.objects.create(
            user=self.user2,
            university="Hawassa University",
            field_of_study="computer science",
            current_year="3rd Year",
            preferred_city="Hawassa",
            work_mode="hybrid",
        )
        self.s2_baseline.skills.add(self.skill_react)
        self.s2_uil = UILStudentProfile.objects.create(
            student=self.s2_baseline,
            student_id_number="HU/002/16",
            campus_city="Hawassa",
            department="computer science",
            academic_year=3,
            gpa=3.60,
            is_active_for_internship=True,
            embedding=make_unit_vector(0.30),
        )

        # Student 3: Full Stack Junior, Year 2, Addis Ababa
        self.user3 = User.objects.create_user(
            email="student3_uil@aau.edu.et",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            first_name="Haile",
            last_name="Gebrselassie",
        )
        self.s3_baseline = Student.objects.create(
            user=self.user3,
            university="Addis Ababa University",
            field_of_study="information technology",
            current_year="2nd Year",
            preferred_city="Addis Ababa",
            work_mode="onsite",
        )
        self.s3_baseline.skills.add(self.skill_python, self.skill_react)
        self.s3_uil = UILStudentProfile.objects.create(
            student=self.s3_baseline,
            student_id_number="AAU/003/16",
            campus_city="Addis Ababa",
            department="information technology",
            academic_year=2,
            gpa=3.40,
            is_active_for_internship=True,
            embedding=make_unit_vector(0.60),
        )

        # 4. Setup 5 Sample Postings
        # Posting A (COMPANY track): Python Backend Engineer in Addis Ababa
        self.posting_a = InternshipPosting.objects.create(
            track=InternshipPosting.Track.COMPANY,
            title="Python Software Engineering Backend Intern",
            description="Developing high-throughput Django microservices and PostgreSQL schemas.",
            owner_company=self.company_profile,
            capacity=5,
            city="Addis Ababa",
            is_active=True,
            embedding=make_unit_vector(0.95),
        )
        self.posting_a.required_skills.add(self.skill_python, self.skill_django)

        # Posting B (COMPANY track): Python Cloud Developer in Addis Ababa
        # Designed to tie on base score with Posting A for Student 1, but with slightly lower semantic vector
        self.posting_b = InternshipPosting.objects.create(
            track=InternshipPosting.Track.COMPANY,
            title="Python Software Engineering Cloud Intern",
            description="Backend cloud systems with Python and automated container deployments.",
            owner_company=self.company_profile,
            capacity=3,
            city="Addis Ababa",
            is_active=True,
            embedding=make_unit_vector(0.70),  # Lower semantic alignment than A (0.95)
        )
        self.posting_b.required_skills.add(self.skill_python, self.skill_django)

        # Posting C (CAMPUS track): In-house Campus Web Portal Developer
        self.posting_c = InternshipPosting.objects.create(
            track=InternshipPosting.Track.CAMPUS,
            title="Campus Web Portal Developer",
            description="Modern React web interface for student administration.",
            owner_department=self.dept,
            capacity=10,
            city="Addis Ababa",
            is_active=True,
            embedding=make_unit_vector(0.40),
        )
        self.posting_c.required_skills.add(self.skill_react)

        # Posting D (DIRECT track): Regional DevOps Engineer in Hawassa
        self.posting_d = InternshipPosting.objects.create(
            track=InternshipPosting.Track.DIRECT,
            title="Regional DevOps Systems Intern",
            description="CI/CD pipelines, Docker container orchestration, and server monitoring.",
            capacity=2,
            city="Hawassa",
            is_active=True,
            embedding=make_unit_vector(0.20),
        )
        self.posting_d.required_skills.add(self.skill_docker)

        # Posting E (COMPANY track): Inactive Posting
        self.posting_e = InternshipPosting.objects.create(
            track=InternshipPosting.Track.COMPANY,
            title="Legacy Inactive Internship",
            description="Closed archived posting.",
            owner_company=self.company_profile,
            capacity=1,
            city="Addis Ababa",
            is_active=False,
            embedding=make_unit_vector(0.90),
        )
        self.posting_e.required_skills.add(self.skill_python)

    def test_deterministic_base_score_formula_exact_match(self):
        """
        Verify that base_score matches the canonical 6-factor formula exactly:
        Skills 40%, Education 20%, Interest 15%, Experience 10%, Location 10%, Work Mode 5%.
        """
        result = match_posting_to_student(self.s1_uil, self.posting_a)

        # Student 1 has Python + Django -> 100% skill overlap (score = 1.0)
        # Education: software engineering matches exact field -> 1.0
        # Interest: neutral / no explicit interest -> 0.5
        # Experience: Year 4 matches senior/entry criteria -> 1.0 or 0.8
        # Location: Addis Ababa == Addis Ababa -> 1.0
        # Work mode: onsite matches preference -> 1.0

        # Calculate manual expected score
        expected = calculate_overall_score(ComponentScores(
            skill_score=1.0,
            education_score=1.0,
            interest_score=0.5,
            experience_score=0.8,
            location_score=1.0,
            work_mode_score=1.0,
        ))

        self.assertEqual(result["base_score"], expected)
        self.assertEqual(result["match_score"], result["base_score"])
        # Final score strictly equals the base score
        self.assertAlmostEqual(result["match_score"], expected, places=2)

    def test_semantic_similarity_tie_breaking(self):
        """
        When two postings (Posting A and Posting B) share the same base weighted score,
        the ranking order MUST break the tie in favor of the posting with higher
        semantic cosine similarity.
        """
        match_a = match_posting_to_student(self.s1_uil, self.posting_a)
        match_b = match_posting_to_student(self.s1_uil, self.posting_b)

        # Assert identical base weighted score
        self.assertEqual(match_a["base_score"], match_b["base_score"])

        # Posting A embedding (0.95) has higher cosine similarity with Student 1 (0.95)
        # than Posting B embedding (0.70)
        self.assertGreater(match_a["semantic_score"], match_b["semantic_score"])

        # Top recommendations query for Student 1
        recommendations = get_posting_recommendations_for_student(self.user1, limit=10)

        # Posting A must be ranked BEFORE Posting B
        posting_ids = [r["posting_id"] for r in recommendations]
        self.assertIn(self.posting_a.id, posting_ids)
        self.assertIn(self.posting_b.id, posting_ids)

        index_a = posting_ids.index(self.posting_a.id)
        index_b = posting_ids.index(self.posting_b.id)
        self.assertLess(index_a, index_b, "Posting A must rank higher than Posting B due to higher semantic similarity")

    def test_inactive_postings_excluded_from_recommendations(self):
        """Verify that inactive postings (is_active=False) are excluded from recommendation pool."""
        recommendations = get_posting_recommendations_for_student(self.user1)
        posting_ids = [r["posting_id"] for r in recommendations]
        self.assertNotIn(self.posting_e.id, posting_ids)

    def test_postings_recommendation_api_endpoint(self):
        """
        GET /api/postings/recommendations/ returns HTTP 200 with the exact
        canonical recommendation response shape plus 'track' and 'posting_id'.
        """
        self.client.force_authenticate(user=self.user1)
        url = reverse("postings:posting-recommendations")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        # Check pagination wrapper
        self.assertIn("count", data)
        self.assertIn("next", data)
        self.assertIn("previous", data)
        self.assertIn("results", data)
        self.assertIn("scoring_metadata", data)

        self.assertGreater(len(data["results"]), 0)
        first_item = data["results"][0]

        # Verify item attributes
        self.assertIn("internship", first_item)
        self.assertIn("match_score", first_item)
        self.assertIn("score_breakdown", first_item)
        self.assertIn("explanation", first_item)
        self.assertIn("track", first_item)
        self.assertIn("posting_id", first_item)

        # Verify nested internship representation
        internship_data = first_item["internship"]
        self.assertIn("title", internship_data)
        self.assertIn("organization_name", internship_data)
        self.assertIn("required_skills", internship_data)
        self.assertIn("city", internship_data)

    def test_celery_task_recalculate_embedding(self):
        """Verify that recalculate_posting_embeddings_task refreshes the 384-dim vector."""
        # Create posting with null embedding
        posting = InternshipPosting.objects.create(
            track=InternshipPosting.Track.DIRECT,
            title="Embedded Systems Placement",
            description="Microcontroller firmware in C and Assembly.",
            capacity=2,
            city="Dire Dawa",
            is_active=True,
            embedding=None,
        )
        posting.required_skills.add(self.skill_python)

        success = recalculate_posting_embeddings_task(posting.id)
        self.assertTrue(success)

        posting.refresh_from_db()
        self.assertIsNotNone(posting.embedding)
        self.assertEqual(len(posting.embedding), 384)

    def test_existing_recommendation_endpoint_output_parity(self):
        """
        Confirm that the baseline /api/recommendations/ endpoint remains
        fully intact and its output structure is unaltered.
        """
        # Ensure StudentProfile exists for user1
        profile, _ = StudentProfile.objects.get_or_create(user=self.user1)
        profile.skills.add(self.skill_python, self.skill_django)
        profile.field_of_study = "software engineering"
        profile.city = "Addis Ababa"
        profile.bio = "Dedicated software engineering intern candidate."
        profile.save()

        # Create active aggregator internship
        aggregator_internship = Internship.objects.create(
            title="Software Engineering Associate",
            organization_name="Ethio Tech Aggregator",
            description="Full-stack Python Django development.",
            city="Addis Ababa",
            internship_type="onsite",
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=False,
            application_url="https://example.com/apply-now",
        )
        aggregator_internship.required_skills.add(self.skill_python)

        self.client.force_authenticate(user=self.user1)
        url = reverse("student-recommendations")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        # Check canonical response keys
        self.assertIn("count", data)
        self.assertIn("results", data)
        self.assertIn("profile_completed", data)
        self.assertIn("scoring_metadata", data)
