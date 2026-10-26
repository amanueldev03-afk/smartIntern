"""
Verification script for Task 1.4 — Company & DataSource Models and Admin Integration.

Tests:
1. Company model with name, website, country, industry, TimeStampedModel.
2. DataSource model with name, type (api/rss/career_site), base_url, config (JSONField),
   is_active, last_synced_at, TimeStampedModel.
3. Django Admin integration:
   - Superuser logs into Django Admin
   - Admin creates Company via /admin/companies/company/add/
   - Admin creates DataSource via /admin/data_sources/datasource/add/
   - Verification of created records in DB.
"""
import os
import sys
import django
import json

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone
from apps.common.models import TimeStampedModel
from apps.companies.models import Company
from apps.data_sources.models import DataSource

User = get_user_model()


def run_checks():
    print("=" * 60)
    print("TASK 1.4 VERIFICATION: Company & DataSource Models & Admin")
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
    admin_email = "admin_company_test@example.com"
    User.objects.filter(email=admin_email).delete()
    Company.objects.filter(name__in=["Google LLC", "Admin Created Corp"]).delete()
    DataSource.objects.filter(name__in=["Remotive API", "Admin Created RSS"]).delete()

    try:
        # Check 1: Inheritance
        check("Company inherits TimeStampedModel", issubclass(Company, TimeStampedModel))
        check("DataSource inherits TimeStampedModel", issubclass(DataSource, TimeStampedModel))

        # Check 2: Direct model creation - Company
        company = Company.objects.create(
            name="Google LLC",
            website="https://careers.google.com",
            country="United States",
            industry="Technology",
        )
        check("Company created successfully", company.id is not None)
        check("Company name is correct", company.name == "Google LLC")
        check("Company website is correct", company.website == "https://careers.google.com")
        check("Company country is correct", company.country == "United States")
        check("Company industry is correct", company.industry == "Technology")
        check("Company created_at is populated", company.created_at is not None)
        check("Company updated_at is populated", company.updated_at is not None)
        check("Company string representation", str(company) == "Google LLC")

        # Check 3: Direct model creation - DataSource
        ds = DataSource.objects.create(
            name="Remotive API",
            type=DataSource.Type.API,
            base_url="https://remotive.com/api/remote-jobs",
            config={"api_key": "test_key_123", "rate_limit": 60, "category": "software-dev"},
            is_active=True,
            last_synced_at=timezone.now(),
        )
        check("DataSource created successfully", ds.id is not None)
        check("DataSource type is 'api'", ds.type == "api")
        check("DataSource base_url is correct", ds.base_url == "https://remotive.com/api/remote-jobs")
        check("DataSource config JSON is correct", ds.config.get("api_key") == "test_key_123")
        check("DataSource is_active is True", ds.is_active is True)
        check("DataSource last_synced_at is populated", ds.last_synced_at is not None)
        check("DataSource created_at is populated", ds.created_at is not None)
        check("DataSource string representation", "Remotive API (API)" in str(ds))

        # Check 4: Django Admin creation
        admin_user = User.objects.create_superuser(
            email=admin_email,
            password="AdminPassword123!",
        )

        client = Client()
        client.force_login(admin_user)

        # Admin creates Company via POST
        response_company_get = client.get("/admin/companies/company/add/")
        check("Admin can access /admin/companies/company/add/", response_company_get.status_code == 200)

        response_company_post = client.post(
            "/admin/companies/company/add/",
            data={
                "name": "Admin Created Corp",
                "website": "https://admincreated.example.com",
                "country": "Germany",
                "industry": "Automotive",
            },
            follow=True,
        )
        check("Admin POST creates Company (status 200/302)", response_company_post.status_code == 200)
        admin_comp = Company.objects.filter(name="Admin Created Corp").first()
        check("Admin-created Company exists in DB", admin_comp is not None)
        check("Admin-created Company industry is Automotive", admin_comp.industry == "Automotive")

        # Admin creates DataSource via POST
        response_ds_get = client.get("/admin/data_sources/datasource/add/")
        check("Admin can access /admin/data_sources/datasource/add/", response_ds_get.status_code == 200)

        response_ds_post = client.post(
            "/admin/data_sources/datasource/add/",
            data={
                "name": "Admin Created RSS",
                "type": "rss",
                "base_url": "https://feeds.example.com/jobs.rss",
                "config": json.dumps({"feed_format": "xml", "items_per_poll": 20}),
                "is_active": "on",
            },
            follow=True,
        )
        check("Admin POST creates DataSource (status 200/302)", response_ds_post.status_code == 200)
        admin_ds = DataSource.objects.filter(name="Admin Created RSS").first()
        check("Admin-created DataSource exists in DB", admin_ds is not None)
        check("Admin-created DataSource type is rss", admin_ds.type == "rss")
        check("Admin-created DataSource config is parsed properly", admin_ds.config.get("feed_format") == "xml")

    finally:
        # Cleanup
        User.objects.filter(email=admin_email).delete()
        Company.objects.filter(name__in=["Google LLC", "Admin Created Corp"]).delete()
        DataSource.objects.filter(name__in=["Remotive API", "Admin Created RSS"]).delete()

    print("=" * 60)
    print(f"RESULTS: {passed}/{total} checks PASSED successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_checks()
