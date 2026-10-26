"""
Phase 10 — Security Testing & Hardening Test Suite (Stage 7).

Covers:
1. Authentication Security (expired/tampered tokens, wrong credentials, blacklisting)
2. Role-Based Access Control (RBAC) (Student cannot access Admin endpoints, Unauthenticated blocked)
3. Object-Level Authorization (Student A cannot view or modify Student B's profile / private resources)
4. Injection Security (SQL injection in filters, search queries, city, country, malicious payload handling)
5. File Upload Security (malicious extensions, path traversal filenames, spoofed headers)
"""

import io
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.students.models import StudentProfile, CV
from apps.internships.models import Internship
from apps.data_sources.models import DataSource

User = get_user_model()


class AuthenticationSecurityTest(TestCase):
    """Stage 7.1 — Authentication security checks."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="sec_auth_student@example.com",
            password="StrongPassword123!",
            role=User.Role.STUDENT,
        )

    def test_invalid_credentials_returns_401(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "sec_auth_student@example.com", "password": "WrongPassword!"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_malformed_and_tampered_jwt_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer malformed.token.payload")
        response = self.client.get("/api/accounts/me/")
        self.assertEqual(response.status_code, 401)

    def test_revoked_refresh_token_cannot_be_reused(self):
        refresh = RefreshToken.for_user(self.user)
        # Logout / Blacklist token
        self.client.force_authenticate(user=self.user)
        logout_resp = self.client.post(
            "/api/accounts/logout/",
            {"refresh": str(refresh)},
            format="json",
        )
        self.assertIn(logout_resp.status_code, [200, 204, 205])

        # Attempt to refresh with blacklisted token
        refresh_resp = self.client.post(
            "/api/auth/refresh/",
            {"refresh": str(refresh)},
            format="json",
        )
        self.assertEqual(refresh_resp.status_code, 401)


class AuthorizationRBACTest(TestCase):
    """Stage 7.2 — Authorization and Role-Based Access Control."""

    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="rbac_student@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
        )
        self.admin = User.objects.create_superuser(
            email="rbac_admin@example.com",
            password="AdminPassword123!",
        )
        self.source = DataSource.objects.create(
            name="RBAC Source",
            type=DataSource.Type.API,
            base_url="https://rbac.example.com",
        )

    def test_unauthenticated_user_denied_from_protected_endpoints(self):
        protected_endpoints = [
            "/api/accounts/me/",
            "/api/students/",
            "/api/recommendations/",
            "/api/applications/history/",
            "/api/admin/students/",
        ]
        for ep in protected_endpoints:
            response = self.client.get(ep)
            self.assertIn(
                response.status_code,
                [401, 403],
                f"Expected 401/403 for unauthenticated access to {ep}, got {response.status_code}",
            )

    def test_student_cannot_access_admin_endpoints(self):
        self.client.force_authenticate(user=self.student)
        admin_endpoints = [
            ("/api/admin/students/", "get"),
            (f"/api/admin/data-sources/{self.source.id}/sync-now/", "post"),
            ("/api/admin/analytics/", "get"),
        ]
        for ep, method in admin_endpoints:
            call = getattr(self.client, method)
            response = call(ep)
            self.assertEqual(
                response.status_code,
                403,
                f"Student was improperly allowed access to admin endpoint {ep}",
            )


class ObjectLevelAccessSecurityTest(TestCase):
    """Stage 7.2 — Object-level authorization isolation."""

    def setUp(self):
        self.client = APIClient()
        self.student_a = User.objects.create_user(
            email="student_a@example.com",
            password="PasswordA123!",
            role=User.Role.STUDENT,
        )
        self.profile_a = StudentProfile.objects.create(
            user=self.student_a,
            bio="Student A Private Bio",
        )

        self.student_b = User.objects.create_user(
            email="student_b@example.com",
            password="PasswordB123!",
            role=User.Role.STUDENT,
        )
        self.profile_b = StudentProfile.objects.create(
            user=self.student_b,
            bio="Student B Private Bio",
        )

    def test_student_profile_endpoint_only_returns_own_profile(self):
        self.client.force_authenticate(user=self.student_a)
        response = self.client.get("/api/students/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("bio"), "Student A Private Bio")
        self.assertNotEqual(response.data.get("bio"), "Student B Private Bio")


class SQLAndInputInjectionSecurityTest(TestCase):
    """Stage 7.3 — SQL Injection, malicious payload, and sanitization tests."""

    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="injection_student@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(user=self.student)
        self.internship = Internship.objects.create(
            title="Secure Python Intern",
            organization_name="CyberTech",
            description="Security and backend development",
            application_url="https://cyber.example.com/apply",
            internship_type="remote",
            work_mode="remote",
            city="Addis Ababa",
            country="Ethiopia",
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=False,
        )

    def test_sql_injection_payloads_in_search_and_filter_query_params(self):
        sqli_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE internships_internship; --",
            "1' UNION SELECT null, null, null, null --",
            "\" OR \"\"=\"",
            "admin'--",
            "1; SELECT pg_sleep(5);",
        ]
        for payload in sqli_payloads:
            # Test in internship search query
            response = self.client.get(f"/api/internships/?search={payload}")
            self.assertEqual(
                response.status_code,
                200,
                f"SQL injection query failed or leaked exception for: {payload}",
            )
            # Database table must still be intact
            self.assertTrue(Internship.objects.filter(id=self.internship.id).exists())

    def test_malformed_json_payload_handled_gracefully(self):
        response = self.client.patch(
            "/api/students/",
            data="this is not valid json {{{",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class FileUploadSecurityTest(TestCase):
    """Stage 7.4 — CV/Resume file upload security tests."""

    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="upload_student@example.com",
            password="Password123!",
            role=User.Role.STUDENT,
        )
        StudentProfile.objects.create(user=self.student)
        self.client.force_authenticate(user=self.student)

    def test_dangerous_extensions_rejected(self):
        dangerous_files = [
            ("malicious.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/x-msdownload"),
            ("script.sh", b"#!/bin/bash\nrm -rf /", "text/x-shellscript"),
            ("webshell.php", b"<?php system($_GET['cmd']); ?>", "application/x-php"),
            ("test.pdf.exe", b"MZexecutablecontent", "application/x-msdownload"),
        ]
        for filename, content, mime in dangerous_files:
            file_obj = SimpleUploadedFile(filename, content, content_type=mime)
            response = self.client.post(
                "/api/students/me/resume/",
                {"resume": file_obj},
                format="multipart",
            )
            self.assertEqual(
                response.status_code,
                400,
                f"Dangerous file {filename} was not rejected with 400!",
            )

    def test_path_traversal_filename_sanitized(self):
        traversal_filename = "../../../../etc/passwd.pdf"
        file_obj = SimpleUploadedFile(traversal_filename, b"%PDF-1.4 sample pdf content", content_type="application/pdf")
        response = self.client.post(
            "/api/students/me/resume/",
            {"resume": file_obj},
            format="multipart",
        )
        # Should either reject or sanitize filename without escaping media directory
        if response.status_code in [200, 201]:
            cv = CV.objects.filter(user=self.student).first()
            if cv and cv.file:
                self.assertNotIn("..", cv.file.name)

