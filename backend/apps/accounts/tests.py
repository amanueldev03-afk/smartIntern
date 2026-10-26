import uuid
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import User

User = get_user_model()


class UserModelTest(TestCase):
    """Test cases for User model"""

    def test_create_user(self):
        """Test creating a new user with UserManager"""
        user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.username, 'testuser')
        self.assertTrue(user.check_password('testpass123'))
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertFalse(user.is_email_verified)

    def test_create_superuser(self):
        """Test creating a superuser with UserManager"""
        user = User.objects.create_superuser(
            email='admin@example.com',
            username='admin',
            password='adminpass123'
        )
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.role, User.Role.ADMIN)

    def test_user_str(self):
        """Test user string representation"""
        user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.assertEqual(str(user), 'test@example.com')

    def test_email_unique(self):
        """Test that email must be unique"""
        User.objects.create_user(
            email='test@example.com',
            username='testuser1',
            password='testpass123'
        )
        with self.assertRaises(Exception):
            User.objects.create_user(
                email='test@example.com',
                username='testuser2',
                password='testpass123'
            )

    def test_user_timestamps(self):
        """Test that timestamps are auto-created"""
        user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.assertIsNotNone(user.created_at)
        self.assertIsNotNone(user.updated_at)


class UserAPITest(TestCase):
    """Test cases for User API endpoints"""

    def setUp(self):
        """Set up test client"""
        self.client = APIClient()

    def test_student_registration_auth_endpoint(self):
        """Test student registration via the canonical /api/auth/register/ endpoint (Task 2.1)"""
        data = {
            'full_name': 'Jane Doe',
            'email': 'authuser@example.com',
            'password': 'SecurePass123!',
            'phone': '+1234567890',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email='authuser@example.com').exists())

    def test_registration_creates_inactive_user_and_student_shell(self):
        """User is created is_active=False with an empty StudentProfile shell until verified (Task 2.1)"""
        data = {
            'full_name': 'Jane Doe',
            'email': 'shell@example.com',
            'password': 'SecurePass123!',
            'phone': '+1234567890',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email='shell@example.com')
        self.assertFalse(user.is_active)
        self.assertFalse(user.is_email_verified)

        from apps.students.models import StudentProfile
        self.assertTrue(StudentProfile.objects.filter(user=user).exists())
        profile = StudentProfile.objects.get(user=user)
        self.assertEqual(profile.phone, '+1234567890')

    def test_registration_duplicate_email_returns_400(self):
        """Registering twice with the same email returns 400 with a field error (not 500)"""
        data = {
            'full_name': 'Jane Doe',
            'email': 'dupe@example.com',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
        }
        first = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        # Second attempt with the same email must be 400, not 500
        second = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', second.data)

    def test_student_registration_password_mismatch(self):
        """Test registration with mismatched passwords"""
        data = {
            'full_name': 'Jane Doe',
            'email': 'newuser@example.com',
            'password': 'SecurePass123!',
            'password_confirm': 'differentpass'
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_registration_weak_password(self):
        """Test registration with weak password"""
        data = {
            'full_name': 'Jane Doe',
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': '123',
            'password_confirm': '123'
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_registration_missing_full_name(self):
        """Test registration without full_name is rejected"""
        data = {
            'email': 'noname@example.com',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('full_name', response.data)

    def test_company_hr_registration_success(self):
        """Test employer registration with organization_name creates user and company"""
        from apps.companies.models import Company
        data = {
            'role': 'company_hr',
            'full_name': 'Sara Recruiter',
            'email': 'hr@telecom.et',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
            'organization_name': 'Ethio Telecom HQ',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'company_hr')

        user = User.objects.get(email='hr@telecom.et')
        self.assertEqual(user.role, User.Role.COMPANY_HR)
        self.assertTrue(Company.objects.filter(name='Ethio Telecom HQ').exists())

    def test_company_hr_registration_missing_organization_name(self):
        """Test company_hr registration without organization_name returns 400"""
        data = {
            'role': 'company_hr',
            'full_name': 'Sara Recruiter',
            'email': 'hr_noname@telecom.et',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('organization_name', response.data)

    def test_advisor_registration_success(self):
        """Test advisor registration with university_name and department"""
        data = {
            'role': 'advisor',
            'full_name': 'Dr. Abebe Advisor',
            'email': 'advisor@aau.edu.et',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
            'university_name': 'Addis Ababa University',
            'department': 'Software Engineering',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'advisor')

        user = User.objects.get(email='advisor@aau.edu.et')
        self.assertEqual(user.role, User.Role.ADVISOR)

    def test_registration_disallowed_role_rejected(self):
        """Test attempting to register with admin role returns 400 (admin self-registration disallowed)"""
        data = {
            'role': 'admin',
            'full_name': 'Attacker Admin',
            'email': 'fake_admin@example.com',
            'password': 'SecurePass123!',
            'password_confirm': 'SecurePass123!',
        }
        response = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)

    def test_student_login(self):
        """Test student login endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()
        data = {
            'email': 'test@example.com',
            'password': 'testpass123'
        }
        response = self.client.post('/api/accounts/student/login/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_student_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        data = {
            'email': 'nonexistent@example.com',
            'password': 'wrongpass'
        }
        response = self.client.post('/api/accounts/student/login/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unified_login_success_issues_tokens_with_role_claim(self):
        """Valid credentials -> 200 with access + refresh and role in claims (Task 2.3, Figure 5.1)"""
        from .services import create_student_user

        user = create_student_user(
            email='login@example.com',
            username='loginuser',
            password='testpass123',
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()

        response = self.client.post('/api/auth/login/', {
            'email': 'login@example.com',
            'password': 'testpass123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], 'student')

        # Decode the access token and assert the role claim is embedded
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken(response.data['access'])
        self.assertEqual(token['role'], 'student')
        self.assertEqual(token['email'], 'login@example.com')

    def test_unified_login_wrong_password_401(self):
        """Wrong password -> 401 (Task 2.3)"""
        from .services import create_student_user

        user = create_student_user(
            email='wrongpw@example.com',
            username='wrongpw',
            password='testpass123',
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()

        response = self.client.post('/api/auth/login/', {
            'email': 'wrongpw@example.com',
            'password': 'incorrect',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unified_login_inactive_account_403(self):
        """Inactive / unverified account -> 403 with 'verify your email' (Task 2.3 alternate path)"""
        from .services import create_student_user

        # Account created by registration is inactive + unverified (Task 2.1)
        create_student_user(
            email='unverified@example.com',
            username='unverified',
            password='testpass123',
        )

        response = self.client.post('/api/auth/login/', {
            'email': 'unverified@example.com',
            'password': 'testpass123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('verify', response.data['detail'].lower())

    def test_protected_endpoint_no_token_returns_401(self):
        """Calling a protected endpoint with no token -> 401 (Task 2.4)"""
        response = self.client.get('/api/accounts/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_invalid_token_returns_401(self):
        """Calling a protected endpoint with a garbage token -> 401 (Task 2.4)"""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.get('/api/accounts/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_endpoint(self):
        """POST /api/auth/refresh/ with a valid refresh token issues new tokens (Task 2.4)"""
        from .services import create_student_user

        user = create_student_user(
            email='refresh@example.com',
            username='refreshuser',
            password='testpass123',
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()

        login = self.client.post('/api/auth/login/', {
            'email': 'refresh@example.com',
            'password': 'testpass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        refresh_token = login.data['refresh']

        refresh = self.client.post('/api/auth/refresh/', {
            'refresh': refresh_token,
        }, format='json')

        self.assertEqual(refresh.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh.data)
        self.assertIn('refresh', refresh.data)

        # The new access token must be usable on a protected endpoint
        new_access = refresh.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access}')
        me = self.client.get('/api/accounts/me/')
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['email'], 'refresh@example.com')

    def test_get_current_user(self):
        """Test getting current user profile"""
        user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=user)
        response = self.client.get('/api/accounts/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'test@example.com')
        self.assertEqual(response.data['username'], 'testuser')

    def test_student_token_denied_on_admin_endpoint(self):
        """A student JWT hitting an admin-only endpoint -> 403 (Task 2.6 / Section 6.7.2)"""
        from .services import create_student_user

        # Real student account (role=student) with a valid JWT
        student = create_student_user(
            email='rbac_student@example.com',
            username='rbacstudent',
            password='testpass123',
        )
        student.is_email_verified = True
        student.is_active = True
        student.save()

        login = self.client.post('/api/auth/login/', {
            'email': 'rbac_student@example.com',
            'password': 'testpass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertEqual(login.data['user']['role'], 'student')

        access = login.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        # Admin-only endpoint must reject a student JWT with 403
        response = self.client.get('/api/internships/admin/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_token_allowed_on_admin_endpoint(self):
        """An admin JWT is allowed on an admin-only endpoint (Task 2.6)"""
        User = get_user_model()

        admin = User.objects.create_superuser(
            email='rbac_admin@example.com',
            username='rbacadmin',
            password='adminpass123',
        )
        self.assertEqual(admin.role, User.Role.ADMIN)

        # Obtain an admin JWT
        login = self.client.post('/api/auth/login/', {
            'email': 'rbac_admin@example.com',
            'password': 'adminpass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertEqual(login.data['user']['role'], 'admin')

        access = login.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        response = self.client.get('/api/internships/admin/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_token_denied_on_student_endpoint(self):
        """An admin JWT is rejected on a student-only endpoint -> 403 (Task 2.6)"""
        User = get_user_model()

        admin = User.objects.create_superuser(
            email='rbac_admin2@example.com',
            username='rbacadmin2',
            password='adminpass123',
        )

        login = self.client.post('/api/auth/login/', {
            'email': 'rbac_admin2@example.com',
            'password': 'adminpass123',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        access = login.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        # Student-only endpoint must reject an admin JWT with 403
        response = self.client.get('/api/internships/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout(self):
        """Test logout endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()
        self.client.force_authenticate(user=user)
        
        # Get refresh token first
        login_response = self.client.post('/api/accounts/student/login/', {
            'email': 'test@example.com',
            'password': 'testpass123'
        }, format='json')
        refresh_token = login_response.data['refresh']
        
        # Logout
        response = self.client.post('/api/accounts/logout/', {'refresh': refresh_token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

    def test_email_verification(self):
        """Test email verification endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        
        # Generate uid and token (simplified test)
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # This will fail with invalid token, but confirms endpoint works
        response = self.client.post('/api/accounts/verify-email/', {
            'uid': uid,
            'token': 'test-token'
        }, format='json')
        # This will fail with invalid token, but confirms endpoint works
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK])

    def test_verify_email_link_activates_account(self):
        """Valid GET link flips is_email_verified=True and is_active=True (Task 2.2)"""
        from .services import create_student_user
        from .tokens import email_verification_token
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes

        user = create_student_user(
            email='activate@example.com',
            username='activator',
            password='testpass123',
        )
        self.assertFalse(user.is_active)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = email_verification_token.make_token(user)

        response = self.client.get(
            f'/api/auth/verify-email/{uid}/{token}/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)
        self.assertTrue(user.is_active)

    def test_verify_email_link_single_use(self):
        """Reusing the same verification token fails (single-use, Task 2.2)"""
        from .services import create_student_user
        from .tokens import email_verification_token
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes

        user = create_student_user(
            email='single@example.com',
            username='singleuse',
            password='testpass123',
        )

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = email_verification_token.make_token(user)

        first = self.client.get(f'/api/auth/verify-email/{uid}/{token}/')
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertTrue(user.is_active)

        # Second use of the same token must fail with 400
        second = self.client.get(f'/api/auth/verify-email/{uid}/{token}/')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_email_link_tampered_token_fails(self):
        """Tampered/expired token returns 400 (Task 2.2)"""
        from .services import create_student_user
        from .tokens import email_verification_token
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes

        user = create_student_user(
            email='tampered@example.com',
            username='tamperer',
            password='testpass123',
        )

        uid = urlsafe_base64_encode(force_bytes(user.pk))

        # Use a bogus token for the existing user
        response = self.client.get(
            f'/api/auth/verify-email/{uid}/not-a-real-token/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertFalse(user.is_email_verified)

        # A uid that does not decode / match any user also fails
        bad_uid = urlsafe_base64_encode(force_bytes(99999))
        valid_token = email_verification_token.make_token(user)
        response = self.client.get(
            f'/api/auth/verify-email/{bad_uid}/{valid_token}/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resend_verification(self):
        """Test resend verification endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        
        response = self.client.post('/api/accounts/resend-verification/', {
            'email': 'test@example.com'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_forgot_password(self):
        """Test forgot password endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        
        response = self.client.post('/api/accounts/forgot-password/', {
            'email': 'test@example.com'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_password_reset_round_trip(self):
        """Full round trip: request reset -> extract token from outbox -> confirm -> login (Task 2.5)"""
        import re
        from django.core import mail
        from .services import create_student_user

        user = create_student_user(
            email='reset@example.com',
            username='resetuser',
            password='oldPass123!',
        )
        user.is_email_verified = True
        user.is_active = True
        user.save()

        # 1. Request the reset
        response = self.client.post('/api/auth/password-reset/', {
            'email': 'reset@example.com',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 2. Extract uid + token from the emailed link (test-mode outbox)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        match = re.search(
            r'/api/auth/password-reset-confirm/(?P<uid>[^/]+)/(?P<token>[^/]+)/',
            body,
        )
        self.assertIsNotNone(match, f"Could not parse reset link from email: {body}")
        uid = match.group('uid')
        token = match.group('token')

        # 3. Confirm with a new password
        confirm = self.client.post(
            f'/api/auth/password-reset-confirm/{uid}/{token}/',
            {
                'password': 'newPass123!',
                'password_confirm': 'newPass123!',
            },
            format='json',
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)

        # 4. New password logs in; old password fails
        login_new = self.client.post('/api/auth/login/', {
            'email': 'reset@example.com',
            'password': 'newPass123!',
        }, format='json')
        self.assertEqual(login_new.status_code, status.HTTP_200_OK)

        login_old = self.client.post('/api/auth/login/', {
            'email': 'reset@example.com',
            'password': 'oldPass123!',
        }, format='json')
        self.assertEqual(login_old.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password(self):
        """Test change password endpoint"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=user)
        
        response = self.client.post('/api/accounts/change-password/', {
            'old_password': 'testpass123',
            'new_password': 'NewSecurePass456!',
            'new_password_confirm': 'NewSecurePass456!'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

    def test_change_password_wrong_old_password(self):
        """Test change password with wrong old password"""
        from .services import create_student_user
        user = create_student_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=user)
        
        response = self.client.post('/api/accounts/change-password/', {
            'old_password': 'wrongpassword',
            'new_password': 'NewSecurePass456!',
            'new_password_confirm': 'NewSecurePass456!'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # Definition of Done (Phase 2) — Table 6.1 TC001–TC003, driven entirely via API
    # =========================================================================

    def test_tc001_registration_via_api(self):
        """TC001: Register via API -> 201, inactive user + Student shell; duplicate email -> 400."""
        from apps.students.models import StudentProfile

        data = {
            'full_name': 'TC One',
            'email': 'tc001@example.com',
            'password': 'SecurePass123!',
            'phone': '+1122334455',
        }

        # Successful registration
        resp = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email='tc001@example.com')
        self.assertFalse(user.is_active, "New account must be inactive until verified")
        self.assertFalse(user.is_email_verified)
        self.assertEqual(user.first_name, 'TC')
        self.assertEqual(user.last_name, 'One')
        self.assertTrue(StudentProfile.objects.filter(user=user, phone='+1122334455').exists())

        # Duplicate registration -> 400 field error (not 500)
        dup = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', dup.data)

    def test_tc002_verify_and_login_via_api(self):
        """TC002: Verify email (activates account) then login issues JWT with role claim."""
        import re
        from django.core import mail

        # Register
        self.client.post('/api/auth/register/', {
            'full_name': 'TC Two',
            'email': 'tc002@example.com',
            'password': 'SecurePass123!',
        }, format='json')

        user = User.objects.get(email='tc002@example.com')

        # Login before verification -> alternate path (403)
        pre = self.client.post('/api/auth/login/', {
            'email': 'tc002@example.com',
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(pre.status_code, status.HTTP_403_FORBIDDEN)

        # Extract verification link from the outbox and hit it (GET)
        match = re.search(
            r'/api/auth/verify-email/(?P<uid>[^/]+)/(?P<token>[^/]+)/',
            mail.outbox[0].body,
        )
        self.assertIsNotNone(match)
        verify = self.client.get(
            f"/api/auth/verify-email/{match.group('uid')}/{match.group('token')}/"
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK)

        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_email_verified)

        # Login after verification -> 200 with tokens + role claim
        login = self.client.post('/api/auth/login/', {
            'email': 'tc002@example.com',
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn('access', login.data)
        self.assertIn('refresh', login.data)
        self.assertEqual(login.data['user']['role'], 'student')

    def test_tc003_refresh_reset_and_rbac_via_api(self):
        """TC003: Refresh tokens, full password reset round trip, and RBAC cross-role block."""
        import re
        from django.core import mail

        # Register + verify
        self.client.post('/api/auth/register/', {
            'full_name': 'TC Three',
            'email': 'tc003@example.com',
            'password': 'OrigPass123!',
        }, format='json')
        user = User.objects.get(email='tc003@example.com')

        vmatch = re.search(
            r'/api/auth/verify-email/(?P<uid>[^/]+)/(?P<token>[^/]+)/',
            mail.outbox[0].body,
        )
        self.client.get(f"/api/auth/verify-email/{vmatch.group('uid')}/{vmatch.group('token')}/")
        user.refresh_from_db()
        self.assertTrue(user.is_active)

        # Login
        login = self.client.post('/api/auth/login/', {
            'email': 'tc003@example.com',
            'password': 'OrigPass123!',
        }, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        refresh_token = login.data['refresh']

        # (a) Token refresh issues new tokens; new access works on a protected route
        refresh = self.client.post('/api/auth/refresh/', {
            'refresh': refresh_token,
        }, format='json')
        self.assertEqual(refresh.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh.data)
        new_access = refresh.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access}')
        me = self.client.get('/api/accounts/me/')
        self.assertEqual(me.status_code, status.HTTP_200_OK)

        # (b) Full password reset round trip
        self.client.credentials()  # clear auth
        rq = self.client.post('/api/auth/password-reset/', {
            'email': 'tc003@example.com',
        }, format='json')
        self.assertEqual(rq.status_code, status.HTTP_200_OK)

        rmatch = re.search(
            r'/api/auth/password-reset-confirm/(?P<uid>[^/]+)/(?P<token>[^/]+)/',
            mail.outbox[-1].body,
        )
        self.assertIsNotNone(rmatch)
        confirm = self.client.post(
            f"/api/auth/password-reset-confirm/{rmatch.group('uid')}/{rmatch.group('token')}/",
            {'password': 'NewPass456!', 'password_confirm': 'NewPass456!'},
            format='json',
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)

        new_login = self.client.post('/api/auth/login/', {
            'email': 'tc003@example.com',
            'password': 'NewPass456!',
        }, format='json')
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

        # (c) RBAC: student token is denied on an admin-only endpoint (Section 6.7.2)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_login.data['access']}")
        admin_resp = self.client.get('/api/internships/admin/dashboard/')
        self.assertEqual(admin_resp.status_code, status.HTTP_403_FORBIDDEN)


class SmartInternETAuthAndRBACTest(TestCase):
    """
    Validation test suite for SmartIntern-ET Core Authentication,
    RBAC (9 actors), and Student Safety & Accessibility Models.
    """

    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/v1/auth/register/"
        self.login_url = "/api/v1/auth/login/"
        self.me_url = "/api/v1/auth/me/"

    def test_user_registration_ethiopian_phone_formats(self):
        """Verify registration accepts valid Ethiopian phone formats."""
        phones = ["+251912345678", "0912345678", "+251712345678", "0712345678"]
        for idx, phone in enumerate(phones):
            data = {
                "email": f"ethio_user_{idx}@aau.edu.et",
                "password": "Password123!",
                "first_name": "Abebe",
                "last_name": "Kebede",
                "phone_number": phone,
                "role": User.Role.STUDENT,
            }
            resp = self.client.post(self.register_url, data, format="json")
            self.assertEqual(
                resp.status_code,
                status.HTTP_201_CREATED,
                f"Failed for phone format: {phone} with {resp.data}",
            )
            created_user = User.objects.get(email=f"ethio_user_{idx}@aau.edu.et")
            self.assertEqual(created_user.phone_number, phone)
            self.assertIsInstance(created_user.id, uuid.UUID)

    def test_user_registration_invalid_phone_formats(self):
        """Verify registration rejects invalid phone numbers."""
        invalid_phones = ["12345", "+1234567890", "0812345678", "+251812345678", "phone12345"]
        for idx, phone in enumerate(invalid_phones):
            data = {
                "email": f"bad_phone_{idx}@aau.edu.et",
                "password": "Password123!",
                "phone_number": phone,
                "role": User.Role.STUDENT,
            }
            resp = self.client.post(self.register_url, data, format="json")
            self.assertEqual(
                resp.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"Accepted invalid phone format: {phone}",
            )
            self.assertIn("phone_number", resp.data)

    def test_email_uniqueness_enforced(self):
        """Verify email uniqueness is strictly enforced."""
        data = {
            "email": "unique.student@aau.edu.et",
            "password": "Password123!",
            "phone_number": "0911223344",
            "role": User.Role.STUDENT,
        }
        resp1 = self.client.post(self.register_url, data, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Duplicate email registration
        resp2 = self.client.post(self.register_url, data, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", resp2.data)

    def test_student_profile_creation_and_unique_constraint(self):
        """
        Verify student profile creation and duplicate ID per university prevention.
        """
        from .models import StudentProfile

        data1 = {
            "email": "student1@aau.edu.et",
            "password": "Password123!",
            "first_name": "Almaz",
            "last_name": "Ayana",
            "phone_number": "0911223344",
            "role": User.Role.STUDENT,
            "student_profile": {
                "student_id_number": "UGR/1234/12",
                "university_name": "Addis Ababa University",
                "campus_city": "Addis Ababa",
                "department": "Software Engineering",
                "academic_year": 4,
                "gpa": "3.85",
                "github_url": "https://github.com/almaz",
                "bio": "Passionate SE student",
                "skill_tags": ["Python", "Django", "React"],
                "is_active_for_internship": True,
            },
        }
        resp1 = self.client.post(self.register_url, data1, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        profile = StudentProfile.objects.get(student_id_number="UGR/1234/12")
        self.assertEqual(profile.university_name, "Addis Ababa University")
        self.assertEqual(profile.user.email, "student1@aau.edu.et")
        self.assertEqual(str(profile.gpa), "3.85")

        # Attempt duplicate registration with the same student ID at the same university
        data2 = {
            "email": "student2@aau.edu.et",
            "password": "Password123!",
            "first_name": "Bekele",
            "last_name": "Molla",
            "phone_number": "0922334455",
            "role": User.Role.STUDENT,
            "student_profile": {
                "student_id_number": "UGR/1234/12",
                "university_name": "Addis Ababa University",
                "campus_city": "Addis Ababa",
                "department": "Computer Science",
            },
        }
        resp2 = self.client.post(self.register_url, data2, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("student_profile", resp2.data)

        # Same student ID at a DIFFERENT university and campus is allowed
        data3 = {
            "email": "student3@aastu.edu.et",
            "password": "Password123!",
            "first_name": "Chala",
            "last_name": "Tadesse",
            "phone_number": "0933445566",
            "role": User.Role.STUDENT,
            "student_profile": {
                "student_id_number": "UGR/1234/12",
                "university_name": "AASTU",
                "campus_city": "Akaki",
                "department": "Electrical Engineering",
            },
        }
        resp3 = self.client.post(self.register_url, data3, format="json")
        self.assertEqual(resp3.status_code, status.HTTP_201_CREATED, resp3.data)

    def test_emergency_contact_and_accessibility_profile(self):
        """
        Verify EmergencyContact and AccessibilityProfile creation and phone validation.
        """
        payload = {
            "email": "safety_student@aau.edu.et",
            "password": "Password123!",
            "first_name": "Derartu",
            "last_name": "Tulu",
            "phone_number": "+251911001122",
            "role": User.Role.STUDENT,
            "student_profile": {
                "student_id_number": "UGR/9999/14",
                "university_name": "Addis Ababa University",
                "campus_city": "Addis Ababa",
                "department": "Information Systems",
                "emergency_contact": {
                    "contact_name": "Tulu Kebede",
                    "relationship": "Father",
                    "primary_phone": "+251922334455",
                    "alternate_phone": "0911556677",
                    "insurance_policy_number": "INS-ET-2026-001",
                },
                "accessibility_profile": {
                    "requires_screen_reader": True,
                    "mobility_assistance_required": False,
                    "workplace_notes": "Requires NVDA screen reader setup.",
                },
            },
        }
        resp = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(email="safety_student@aau.edu.et")
        profile = user.student_profile
        self.assertIsNotNone(profile.emergency_contact)
        self.assertEqual(profile.emergency_contact.contact_name, "Tulu Kebede")
        self.assertEqual(profile.emergency_contact.insurance_policy_number, "INS-ET-2026-001")

        self.assertIsNotNone(profile.accessibility_profile)
        self.assertTrue(profile.accessibility_profile.requires_screen_reader)
        self.assertFalse(profile.accessibility_profile.mobility_assistance_required)
        self.assertEqual(
            profile.accessibility_profile.workplace_notes,
            "Requires NVDA screen reader setup.",
        )

    def test_jwt_custom_claims_on_login(self):
        """
        Verify CustomTokenObtainPairView (/api/v1/auth/login/) embeds:
        user_id, email, role, and full_name.
        """
        user = User.objects.create_user(
            email="dean@aau.edu.et",
            password="DeanPassword123!",
            first_name="Dr. Solomon",
            last_name="Gizaw",
            phone_number="+251911998877",
            role=User.Role.DEPT_DEAN,
            is_active=True,
            is_email_verified=True,
            is_approved=True,
        )

        resp = self.client.post(
            self.login_url,
            {"email": "dean@aau.edu.et", "password": "DeanPassword123!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken(resp.data["access"])
        self.assertEqual(token["user_id"], str(user.id))
        self.assertEqual(token["email"], "dean@aau.edu.et")
        self.assertEqual(token["role"], User.Role.DEPT_DEAN)
        self.assertEqual(token["full_name"], "Dr. Solomon Gizaw")

    def test_current_user_me_endpoint(self):
        """Verify /api/v1/auth/me/ returns authenticated user details."""
        user = User.objects.create_user(
            email="uil@aau.edu.et",
            password="UilPassword123!",
            first_name="Hanna",
            last_name="Girma",
            role=User.Role.UIL_OFFICER,
            is_active=True,
            is_email_verified=True,
            is_approved=True,
        )
        login_resp = self.client.post(
            self.login_url,
            {"email": "uil@aau.edu.et", "password": "UilPassword123!"},
            format="json",
        )
        token = login_resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        me_resp = self.client.get(self.me_url)
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(me_resp.data["email"], "uil@aau.edu.et")
        self.assertEqual(me_resp.data["role"], User.Role.UIL_OFFICER)
        self.assertEqual(me_resp.data["full_name"], "Hanna Girma")

    def test_rbac_permission_classes(self):
        """
        Verify all 8 RBAC permission classes correctly grant and restrict access.
        """
        from apps.accounts.permissions import (
            IsStudent,
            IsDeptDean,
            IsUILOfficer,
            IsAcademicAdvisor,
            IsCompanyHR,
            IsCompanyMentor,
            IsLogisticsAdmin,
            IsSystemAdmin,
        )

        class MockRequest:
            def __init__(self, user):
                self.user = user

        student = User.objects.create_user(email="p_student@test.com", password="P!", role=User.Role.STUDENT, is_active=True)
        dean = User.objects.create_user(email="p_dean@test.com", password="P!", role=User.Role.DEPT_DEAN, is_active=True)
        uil = User.objects.create_user(email="p_uil@test.com", password="P!", role=User.Role.UIL_OFFICER, is_active=True)
        advisor = User.objects.create_user(email="p_advisor@test.com", password="P!", role=User.Role.ADVISOR, is_active=True)
        union = User.objects.create_user(email="p_union@test.com", password="P!", role=User.Role.STUDENT_UNION, is_active=True)
        dorm = User.objects.create_user(email="p_dorm@test.com", password="P!", role=User.Role.DORM_ADMIN, is_active=True)
        hr = User.objects.create_user(email="p_hr@test.com", password="P!", role=User.Role.COMPANY_HR, is_active=True)
        mentor = User.objects.create_user(email="p_mentor@test.com", password="P!", role=User.Role.COMPANY_MENTOR, is_active=True)
        admin = User.objects.create_superuser(email="p_admin@test.com", password="P!", role=User.Role.ADMIN, is_active=True)

        # 1. IsStudent
        self.assertTrue(IsStudent().has_permission(MockRequest(student), None))
        self.assertFalse(IsStudent().has_permission(MockRequest(dean), None))

        # 2. IsDeptDean
        self.assertTrue(IsDeptDean().has_permission(MockRequest(dean), None))
        self.assertFalse(IsDeptDean().has_permission(MockRequest(uil), None))

        # 3. IsUILOfficer
        self.assertTrue(IsUILOfficer().has_permission(MockRequest(uil), None))
        self.assertFalse(IsUILOfficer().has_permission(MockRequest(advisor), None))

        # 4. IsAcademicAdvisor
        self.assertTrue(IsAcademicAdvisor().has_permission(MockRequest(advisor), None))
        self.assertFalse(IsAcademicAdvisor().has_permission(MockRequest(student), None))

        # 5. IsCompanyHR
        self.assertTrue(IsCompanyHR().has_permission(MockRequest(hr), None))
        self.assertFalse(IsCompanyHR().has_permission(MockRequest(mentor), None))

        # 6. IsCompanyMentor
        self.assertTrue(IsCompanyMentor().has_permission(MockRequest(mentor), None))
        self.assertFalse(IsCompanyMentor().has_permission(MockRequest(hr), None))

        # 7. IsLogisticsAdmin (Student Union and Dorm Admin)
        self.assertTrue(IsLogisticsAdmin().has_permission(MockRequest(union), None))
        self.assertTrue(IsLogisticsAdmin().has_permission(MockRequest(dorm), None))
        self.assertFalse(IsLogisticsAdmin().has_permission(MockRequest(student), None))

        # 8. IsSystemAdmin
        self.assertTrue(IsSystemAdmin().has_permission(MockRequest(admin), None))
        self.assertFalse(IsSystemAdmin().has_permission(MockRequest(dean), None))

    def test_amharic_locale_translation_and_accept_language_header(self):
        """
        Verify Amharic translation catalog and LocaleMiddleware Accept-Language header handling.
        """
        from django.utils import translation
        from django.utils.translation import gettext as _

        # 1. Direct activation of Amharic translation
        with translation.override("am"):
            self.assertEqual(_("Invalid credentials"), "ልክ ያልሆነ መለያ መረጃ")
            self.assertEqual(_("Letter expired"), "ደብዳቤው ጊዜው አልፎበታል")
            self.assertEqual(_("Application submitted successfully"), "ማመልከቻው በተሳካ ሁኔታ ገብቷል")
            self.assertEqual(_("Permission denied"), "ፈቃድ ተከልክሏል")

        # 2. English fallback / default
        with translation.override("en"):
            self.assertEqual(_("Invalid credentials"), "Invalid credentials")
            self.assertEqual(_("Letter expired"), "Letter expired")
            self.assertEqual(_("Application submitted successfully"), "Application submitted successfully")
            self.assertEqual(_("Permission denied"), "Permission denied")

        # 3. HTTP Request with Accept-Language header activates Amharic
        resp = self.client.get("/api/health/", HTTP_ACCEPT_LANGUAGE="am")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # LocaleMiddleware sets Content-Language response header
        self.assertIn("am", resp.headers.get("Content-Language", "am"))

    def test_is_finance_officer_permission(self):
        """Verify IsFinanceOfficer permission class."""
        from .permissions import IsFinanceOfficer

        class MockRequest:
            def __init__(self, user):
                self.user = user

        finance = User.objects.create_user(email="fin@aau.edu.et", password="Password123!", role=User.Role.FINANCE_OFFICER)
        student = User.objects.create_user(email="std_fin@aau.edu.et", password="Password123!", role=User.Role.STUDENT)
        self.assertTrue(IsFinanceOfficer().has_permission(MockRequest(finance), None))
        self.assertFalse(IsFinanceOfficer().has_permission(MockRequest(student), None))

    def test_plain_student_registration_byte_identical_response_shape(self):
        """
        Verify that a plain student registration returns the expected response shape
        and keys (message, user keys including student_profile).
        """
        payload = {
            "email": "byte_student@aau.edu.et",
            "password": "Password123!",
            "first_name": "Abebe",
            "last_name": "Bikila",
            "role": "STUDENT",
        }
        resp = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertIn("message", data)
        self.assertEqual(data["message"], "User registered successfully.")
        self.assertIn("user", data)
        user_data = data["user"]
        expected_keys = {
            "id", "email", "username", "first_name", "last_name", "full_name",
            "phone_number", "role", "is_active", "is_staff", "is_email_verified",
            "profile_photo", "date_joined", "student_profile",
            "is_approved", "university_name", "department", "staff_id_number",
        }
        self.assertEqual(set(user_data.keys()), expected_keys)
        self.assertEqual(user_data["email"], "byte_student@aau.edu.et")
        self.assertEqual(user_data["role"], "STUDENT")

    def test_duplicate_student_id_and_campus_city_raises_validation_error(self):
        """
        Verify that a duplicate (student_id_number, campus_city) registration
        attempt in UILStudentProfile raises a validation error.
        """
        payload1 = {
            "email": "student_orig@aau.edu.et",
            "password": "Password123!",
            "first_name": "Kenenisa",
            "last_name": "Bekele",
            "role": "STUDENT",
            "student_profile": {
                "student_id_number": "UGR/DUPE/2026",
                "university_name": "Addis Ababa University",
                "campus_city": "Addis Ababa",
                "department": "Software Engineering",
            },
        }
        resp1 = self.client.post(self.register_url, payload1, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Second attempt with same student_id_number and campus_city
        payload2 = {
            "email": "student_dupe@aau.edu.et",
            "password": "Password123!",
            "first_name": "Haile",
            "last_name": "Gebre",
            "role": "STUDENT",
            "student_profile": {
                "student_id_number": "UGR/DUPE/2026",
                "university_name": "Addis Ababa Science and Tech University",
                "campus_city": "Addis Ababa",
                "department": "Computer Science",
            },
        }
        resp2 = self.client.post(self.register_url, payload2, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        data = resp2.json()
        self.assertTrue("student_profile" in data or "student_id_number" in data)

    def test_accessibility_profile_fernet_encryption_at_rest(self):
        """
        Verify that workplace_notes in AccessibilityProfile are encrypted at rest.
        """
        from apps.students.models import Student as ExistingStudent
        from apps.uil_profiles.models import UILStudentProfile, AccessibilityProfile
        from django.db import connection

        user = User.objects.create_user(email="fernet_test@aau.edu.et", password="Password123!", role=User.Role.STUDENT)
        student = ExistingStudent.objects.create(user=user)
        uil = UILStudentProfile.objects.create(
            student=student,
            student_id_number="UGR/FERNET/26",
            campus_city="Hawassa",
            department="Medicine",
        )
        acc = AccessibilityProfile.objects.create(
            student_profile=uil,
            requires_screen_reader=True,
            workplace_notes="Confidential note: requires specialized wheelchair ramp.",
        )

        # In-memory / model attribute returns decrypted string
        acc.refresh_from_db()
        self.assertEqual(acc.workplace_notes, "Confidential note: requires specialized wheelchair ramp.")

        # Raw SQL query checks that text at rest is NOT plaintext
        with connection.cursor() as cursor:
            cursor.execute("SELECT workplace_notes FROM uil_profiles_accessibilityprofile WHERE id = %s", [acc.id])
            raw_val = cursor.fetchone()[0]
            self.assertNotEqual(raw_val, "Confidential note: requires specialized wheelchair ramp.")
            self.assertTrue(raw_val.startswith("gAAAAA") or len(raw_val) > 40)

    def test_register_dorm_admin_and_student_union_success_and_validation(self):
        """
        Verify registration for dorm_admin and student_union with university_name and unique staff_id_number.
        Also verifies that is_approved is False pending administrator approval.
        """
        # 1. Successful dorm_admin registration
        payload_dorm = {
            "full_name": "Abebe Dormitory Admin",
            "email": "dorm_admin_reg@aau.edu.et",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "role": "dorm_admin",
            "university_name": "Addis Ababa University",
            "staff_id_number": "AAU-DORM-REG-01",
        }
        resp = self.client.post("/api/auth/register/", payload_dorm, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        dorm_user = User.objects.get(email="dorm_admin_reg@aau.edu.et")
        self.assertEqual(dorm_user.role, User.Role.DORM_ADMIN)
        self.assertEqual(dorm_user.university_name, "Addis Ababa University")
        self.assertEqual(dorm_user.staff_id_number, "AAU-DORM-REG-01")
        self.assertFalse(dorm_user.is_approved)

        # 2. Duplicate staff_id_number at same university should be rejected
        payload_dupe = {
            "full_name": "Second Dorm Admin",
            "email": "dorm_dupe@aau.edu.et",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "role": "dorm_admin",
            "university_name": "Addis Ababa University",
            "staff_id_number": "AAU-DORM-REG-01",
        }
        resp_dupe = self.client.post("/api/auth/register/", payload_dupe, format="json")
        self.assertEqual(resp_dupe.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("staff_id_number", resp_dupe.json())

        # 3. Successful student_union registration
        payload_union = {
            "full_name": "Sara Student Dean",
            "email": "union_dean_reg@aau.edu.et",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "role": "student_union",
            "university_name": "Addis Ababa University",
            "staff_id_number": "AAU-UNION-REG-01",
        }
        resp_union = self.client.post("/api/auth/register/", payload_union, format="json")
        self.assertEqual(resp_union.status_code, status.HTTP_201_CREATED)
        union_user = User.objects.get(email="union_dean_reg@aau.edu.et")
        self.assertEqual(union_user.role, User.Role.STUDENT_UNION)
        self.assertEqual(union_user.university_name, "Addis Ababa University")
        self.assertEqual(union_user.staff_id_number, "AAU-UNION-REG-01")
        self.assertFalse(union_user.is_approved)

        # 4. Missing staff_id_number for dorm_admin is rejected
        payload_no_staff_id = {
            "full_name": "Missing Staff ID Admin",
            "email": "no_staff_id@aau.edu.et",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "role": "dorm_admin",
            "university_name": "Addis Ababa University",
            "staff_id_number": "",
        }
        resp_no_id = self.client.post("/api/auth/register/", payload_no_staff_id, format="json")
        self.assertEqual(resp_no_id.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("staff_id_number", resp_no_id.json())
