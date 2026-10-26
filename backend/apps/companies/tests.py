from django.test import TestCase
from django.db import IntegrityError
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.models import TimeStampedModel
from apps.accounts.models import User
from .models import Company


class CompanyModelTest(TestCase):
    """Test cases for Company model (Section 3.6 / Task 1.4)."""

    def test_create_company(self):
        """Test creating a company with all fields."""
        company = Company.objects.create(
            name="Google LLC",
            website="https://careers.google.com",
            country="United States",
            industry="Technology",
        )
        self.assertEqual(company.name, "Google LLC")
        self.assertEqual(company.website, "https://careers.google.com")
        self.assertEqual(company.country, "United States")
        self.assertEqual(company.industry, "Technology")
        self.assertIsNotNone(company.created_at)
        self.assertIsNotNone(company.updated_at)
        self.assertTrue(issubclass(Company, TimeStampedModel))

    def test_company_str_representation(self):
        """Test string representation of Company."""
        company = Company.objects.create(name="DeepMind")
        self.assertEqual(str(company), "DeepMind")

    def test_company_name_unique(self):
        """Test that company name must be unique."""
        Company.objects.create(name="Unique Corp")
        with self.assertRaises(IntegrityError):
            Company.objects.create(name="Unique Corp")


class CompanyAPITest(TestCase):
    """
    Phase 4 Task 4.1 — Company CRUD, admin-only.

    GET/POST on /api/companies/ and GET/PUT/PATCH/DELETE on
    /api/companies/{id}/ are gated by IsAdminRole (Task 2.6): a student JWT
    (or no token) receives 403/401, while an admin can round-trip a company
    end to end.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="phase4_admin@example.com",
            username="phase4admin",
            password="testpass123",
            role=User.Role.ADMIN,
            is_staff=True,
            is_email_verified=True,
        )

        self.student = User.objects.create_user(
            email="phase4_student@example.com",
            username="phase4student",
            password="testpass123",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )

        self.company = Company.objects.create(
            name="Google LLC",
            website="https://careers.google.com",
            country="United States",
            industry="Technology",
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    # ----- RBAC: non-admin / anonymous --------------------------------

    def test_unauthenticated_gets_401(self):
        response = self.client.get("/api/companies/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post("/api/companies/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_cannot_list_companies(self):
        self._auth(self.student)
        response = self.client.get("/api/companies/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_create_company(self):
        self._auth(self.student)
        response = self.client.post("/api/companies/", {
            "name": "Blocked Corp",
            "website": "https://blocked.example.com",
            "country": "Anywhere",
            "industry": "Edge Case",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Company.objects.filter(name="Blocked Corp").exists()
        )

    def test_student_cannot_retrieve_company(self):
        self._auth(self.student)
        response = self.client.get(f"/api/companies/{self.company.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_patch_company(self):
        self._auth(self.student)
        response = self.client.patch(
            f"/api/companies/{self.company.id}/",
            {"industry": "Hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.company.refresh_from_db()
        self.assertEqual(self.company.industry, "Technology")

    def test_student_cannot_delete_company(self):
        self._auth(self.student)
        response = self.client.delete(f"/api/companies/{self.company.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            Company.objects.filter(pk=self.company.pk).exists()
        )

    # ----- Admin CRUD round trip --------------------------------------

    def test_admin_can_create_company(self):
        self._auth(self.admin)
        response = self.client.post("/api/companies/", {
            "name": "DeepMind",
            "website": "https://deepmind.com",
            "country": "United Kingdom",
            "industry": "Artificial Intelligence",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "DeepMind")
        self.assertIn("created_at", response.data)
        self.assertEqual(Company.objects.count(), 2)

    def test_admin_cannot_create_duplicate_company_name(self):
        self._auth(self.admin)
        response = self.client.post("/api/companies/", {
            "name": "Google LLC",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_admin_can_list_companies(self):
        self._auth(self.admin)
        response = self.client.get("/api/companies/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        names = {item["name"] for item in response.data["results"]}
        self.assertEqual(names, {"Google LLC"})

    def test_admin_can_retrieve_company(self):
        self._auth(self.admin)
        response = self.client.get(f"/api/companies/{self.company.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Google LLC")
        self.assertEqual(response.data["industry"], "Technology")

    def test_admin_can_patch_company(self):
        self._auth(self.admin)
        response = self.client.patch(
            f"/api/companies/{self.company.id}/",
            {"country": "Ireland", "industry": "Search"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["country"], "Ireland")
        self.assertEqual(response.data["industry"], "Search")
        self.company.refresh_from_db()
        self.assertEqual(self.company.country, "Ireland")
        self.assertEqual(self.company.industry, "Search")

    def test_admin_crud_round_trip(self):
        """Create -> list -> retrieve -> patch -> delete, all as admin."""
        self._auth(self.admin)

        # Create
        created = self.client.post("/api/companies/", {
            "name": "Acme Corp",
            "website": "https://acme.example.com",
            "country": "United States",
            "industry": "Robotics",
        }, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        company_id = created.data["id"]

        # List shows it
        listed = self.client.get("/api/companies/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(
            "Acme Corp",
            {item["name"] for item in listed.data["results"]},
        )

        # Retrieve
        retrieved = self.client.get(f"/api/companies/{company_id}/")
        self.assertEqual(retrieved.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieved.data["name"], "Acme Corp")

        # Patch
        patched = self.client.patch(
            f"/api/companies/{company_id}/",
            {"industry": "Aerospace"},
            format="json",
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["industry"], "Aerospace")

        # Delete
        deleted = self.client.delete(f"/api/companies/{company_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Company.objects.filter(pk=company_id).exists())

    def test_delete_company_nulls_internships_company_link(self):
        """Deleting a company must not delete its internships (SET_NULL)."""
        from apps.internships.models import Internship, InternshipSource

        source = InternshipSource.objects.create(
            name="Careers Page",
            source_type="website",
        )
        internship = Internship.objects.create(
            title="Robotics Intern",
            organization_name="Acme Corp",
            description="A robotics internship.",
            application_url="https://acme.example.com/apply",
            source=source,
            company=self.company,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            embedding_status=Internship.EMBEDDING_STATUS_COMPLETED,
        )

        self._auth(self.admin)
        response = self.client.delete(f"/api/companies/{self.company.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        internship.refresh_from_db()
        self.assertIsNone(internship.company)

    def test_company_list_includes_internship_count(self):
        from apps.internships.models import Internship, InternshipSource

        source = InternshipSource.objects.create(
            name="Careers Page",
            source_type="website",
        )
        Internship.objects.create(
            title="SWE Intern",
            organization_name="Google LLC",
            description="Software engineering internship.",
            application_url="https://careers.google.com/apply",
            source=source,
            company=self.company,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            embedding_status=Internship.EMBEDDING_STATUS_COMPLETED,
        )

        self._auth(self.admin)
        response = self.client.get(f"/api/companies/{self.company.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["internship_count"], 1)


class Phase4DefinitionOfDoneTest(TestCase):
    """
    Phase 4 Task 4.1 Definition of Done (Table 6.1, TC006).

    Company CRUD (/api/companies/) is admin-only: a student JWT receives 403
    on every verb, and an admin can round-trip a company through
    create -> list -> retrieve -> patch -> delete.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            email="phase4_dod_admin@example.com",
            username="phase4dodadmin",
            password="testpass123",
            role=User.Role.ADMIN,
            is_staff=True,
            is_email_verified=True,
        )

        self.student = User.objects.create_user(
            email="phase4_dod_student@example.com",
            username="phase4dodstudent",
            password="testpass123",
            role=User.Role.STUDENT,
            is_email_verified=True,
        )

    def _auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_tc006_non_admin_blocked_admin_crud_round_trips(self):
        # Non-admin receives 403 on every verb of the company CRUD API.
        self._auth(self.student)
        self.assertEqual(
            self.client.get("/api/companies/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post("/api/companies/", {
                "name": "Blocked Corp",
            }, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Seed a company for the admin round trip.
        company = Company.objects.create(
            name="Seed Corp",
            website="https://seed.example.com",
            country="United States",
            industry="Software",
        )

        self.assertEqual(
            self.client.patch(
                f"/api/companies/{company.id}/",
                {"industry": "Hacked"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(f"/api/companies/{company.id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertTrue(Company.objects.filter(pk=company.pk).exists())

        # Admin round-trips the same company end to end.
        self._auth(self.admin)

        created = self.client.post("/api/companies/", {
            "name": "Round Trip Inc",
            "website": "https://roundtrip.example.com",
            "country": "Canada",
            "industry": "AI",
        }, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        company_id = created.data["id"]

        listed = self.client.get("/api/companies/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(
            "Round Trip Inc",
            {item["name"] for item in listed.data["results"]},
        )

        retrieved = self.client.get(f"/api/companies/{company_id}/")
        self.assertEqual(retrieved.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieved.data["name"], "Round Trip Inc")

        patched = self.client.patch(
            f"/api/companies/{company_id}/",
            {"industry": "Machine Learning"},
            format="json",
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.data["industry"], "Machine Learning")

        deleted = self.client.delete(f"/api/companies/{company_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Company.objects.filter(pk=company_id).exists())