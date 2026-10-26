from rest_framework import (
    generics,
    status,
    serializers,
)
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticated
)
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import AnonRateThrottle
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.utils import extend_schema, OpenApiExample, OpenApiParameter
from drf_spectacular.types import OpenApiTypes
from django.contrib.auth import get_user_model
User = get_user_model()
from .jwt import LoginSerializer
from .serializers import (
    EmailVerificationSerializer,
    StudentRegistrationSerializer,
    LogoutSerializer,
    UserSerializer,
    UserProfileUpdateSerializer,
    ResendVerificationSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserDetailSerializer,
    StudentProfileSerializer,
)


@extend_schema(tags=["Authentication"])
class AuthTokenRefreshView(TokenRefreshView):
    """
    Refresh an expired access token using a valid refresh token.
    """
    throttle_classes = [AnonRateThrottle]


@extend_schema(tags=["Authentication"])
class StudentRegistrationView(generics.CreateAPIView):
    """
    Register a new student.
    """

    serializer_class = StudentRegistrationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    @extend_schema(
        tags=["Authentication"],
        operation_id="student_register",
        summary="Student Registration",
        description="Register a new student account with email verification requirement",
        responses={
            201: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'},
                    'user': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'email': {'type': 'string'},
                            'username': {'type': 'string'},
                        }
                    }
                }
            }
        },
        examples=[
            OpenApiExample(
                "Student Registration",
                value={
                    "full_name": "Student Name",
                    "email": "student@example.com",
                    "phone": "+1234567890",
                    "password": "SecurePassword123!",
                    "password_confirm": "SecurePassword123!"
                }
            )
        ]
    )
    def create(self, request, *args, **kwargs):

        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        user = serializer.save()

        full_name = " ".join(
            filter(None, [user.first_name, user.last_name])
        )

        role_str = str(user.role).upper()
        if role_str == User.Role.ADMIN:
            msg = "Administrator account registered successfully. You can now log in."
        elif role_str == User.Role.ADVISOR:
            msg = "Registration successful. Please verify your email. Note: Your academic advisor account requires UIL Officer approval before sign-in."
        elif role_str in (User.Role.DEPT_DEAN, User.Role.UIL_OFFICER, User.Role.STUDENT_UNION, User.Role.DORM_ADMIN, User.Role.FINANCE_OFFICER):
            msg = "Registration successful. Please verify your email. Note: Your institutional staff account requires Administrator approval before sign-in."
        else:
            msg = "Registration successful. Please check your email to verify your account."

        resp_data = {
            "message": msg,
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": full_name,
                "role": str(user.role).lower(),
            },
        }

        if user.is_active and getattr(user, "is_approved", True):
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            refresh["role"] = str(user.role).lower()
            refresh["email"] = user.email
            refresh["full_name"] = full_name
            resp_data["access"] = str(refresh.access_token)
            resp_data["refresh"] = str(refresh)

        return Response(
            resp_data,
            status=status.HTTP_201_CREATED,
        )


class LogoutView(GenericAPIView):
    """
    JWT Logout.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LogoutSerializer

    @extend_schema(
        tags=["Authentication"],
        operation_id="user_logout",
        summary="User Logout",
        description="Logout by invalidating the JWT refresh token",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Logout",
                value={"refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."},
            )
        ]
    )
    def post(self, request):

        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        serializer.save()

        return Response(
            {
                "message": "Logout successful."
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserView(GenericAPIView):
    """
    Return the currently authenticated user with complete profile, safety, and accessibility details.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = UserDetailSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(
        tags=["Authentication"],
        operation_id="get_current_user",
        summary="Get Current User",
        description="Retrieve account details and role information of the currently authenticated user",
        responses={200: UserDetailSerializer}
    )
    def get(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @extend_schema(
        tags=["Authentication"],
        operation_id="update_current_user",
        summary="Update Current User",
        description="Update the current user's profile (e.g. profile photo, name).",
        request=UserProfileUpdateSerializer,
        responses={200: UserDetailSerializer},
    )
    def patch(self, request):
        update_serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        update_serializer.is_valid(raise_exception=True)
        update_serializer.save()

        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        return self.patch(request)


@extend_schema(tags=["Authentication"])
class CustomTokenObtainPairView(TokenObtainPairView):
    """
    SmartIntern-ET custom JWT login endpoint returning claims: user_id, email, role, full_name.
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]


@extend_schema(tags=["Authentication"])
class RegisterView(generics.CreateAPIView):
    """
    Register a user for any SmartIntern-ET role with optional student safety profile creation.
    Enforces email uniqueness, Ethiopian phone regex, and unique (student_id_number, university_name).
    """
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user_data = UserDetailSerializer(user).data
        return Response(
            {
                "message": "User registered successfully.",
                "user": user_data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    Unified login (Task 2.3 / Figure 5.1).

    ``POST /api/auth/login/``

    Verifies credentials and account state, then issues access + refresh
    tokens with the user's ``role`` embedded in the claims.

    Returns:
      * ``200`` with tokens on success
      * ``401`` on invalid email/password
      * ``403`` when the account is inactive / email not verified
    """

    permission_classes = [AllowAny]
    serializer_class = LoginSerializer
    throttle_classes = [AnonRateThrottle]

    @extend_schema(
        tags=["Authentication"],
        operation_id="token_obtain_pair",
        summary="Unified Login",
        description=(
            "Authenticate with email and password. Returns JWT access/refresh "
            "tokens with the user's role embedded in the claims for routing."
        ),
        request=LoginSerializer,
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'access': {'type': 'string'},
                    'refresh': {'type': 'string'},
                    'user': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'integer'},
                            'email': {'type': 'string'},
                            'role': {'type': 'string'},
                        }
                    }
                }
            },
            401: {
                'type': 'object',
                'properties': {
                    'detail': {'type': 'string'}
                }
            },
            403: {
                'type': 'object',
                'properties': {
                    'detail': {'type': 'string'}
                }
            },
        },
        examples=[
            OpenApiExample(
                "Login",
                value={
                    "email": "student@example.com",
                    "password": "SecurePassword123!",
                },
            )
        ]
    )
    def post(self, request):

        serializer = self.serializer_class(data=request.data)

        if not serializer.is_valid():
            # Map the serializer outcome to the correct status code.
            if getattr(serializer, "outcome", "invalid") == "inactive":
                return Response(
                    {
                        "detail": (
                            "Please verify your email "
                            "before logging in."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if getattr(serializer, "outcome", "invalid") == "unapproved":
                detail_val = serializer.errors.get("detail", "Your staff account is pending institutional administrator approval.")
                if isinstance(detail_val, list):
                    detail_val = detail_val[0]
                return Response(
                    {"detail": str(detail_val)},
                    status=status.HTTP_403_FORBIDDEN,
                )
            detail_val = serializer.errors.get("detail", "Invalid email or password.")
            if isinstance(detail_val, list):
                detail_val = detail_val[0]
            return Response(
                {"detail": str(detail_val)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = serializer.validated_data["user"]
        role_val = serializer.validated_data.get(
            "role_val",
            str(user.role).lower()
        )

        return Response(
            {
                "access": serializer.validated_data["access"],
                "refresh": serializer.validated_data["refresh"],
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                    "role": role_val,
                },
            },
            status=status.HTTP_200_OK,
        )


class EmailVerificationLinkView(GenericAPIView):
    """
    Verify a student's email address via a GET link (Task 2.2).

    Endpoint: ``GET /api/auth/verify-email/<uid>/<token>/``

    Decodes the signed token, checks expiry, and flips the account to
    ``is_active=True``. A token may only be used once — reusing it fails
    with 400.
    """

    permission_classes = [AllowAny]
    serializer_class = EmailVerificationSerializer

    @extend_schema(
        tags=["Authentication"],
        summary="Verify Email via Link",
        description=(
            "Verify user email and activate the account using the UID and "
            "verification token embedded in the emailed link. Single-use."
        ),
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            },
            400: {
                'type': 'object',
                'properties': {
                    'detail': {'type': 'string'}
                }
            },
        },
    )
    def perform_content_negotiation(self, request, force=False):
        try:
            return super().perform_content_negotiation(request, force=force)
        except Exception:
            from rest_framework.renderers import JSONRenderer
            return (JSONRenderer(), "application/json")

    def get(self, request, uid, token):
        from django.http import HttpResponseRedirect
        from urllib.parse import quote
        from django.utils.http import urlsafe_base64_decode
        from .services import get_live_frontend_url

        is_html = (
            "text/html" in request.headers.get("Accept", "")
            or "text/html" in request.META.get("HTTP_ACCEPT", "")
        )
        frontend_url = get_live_frontend_url()

        serializer = self.get_serializer(
            data={
                "uid": uid,
                "token": token,
            }
        )

        try:
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
        except serializers.ValidationError as exc:
            # Check if this user was already verified
            try:
                user_id = urlsafe_base64_decode(uid).decode()
                user = User.objects.filter(pk=user_id).first()
            except Exception:
                user = None

            if user and user.is_email_verified:
                role_str = str(user.role).lower()
                if is_html:
                    return HttpResponseRedirect(
                        f"{frontend_url}/login?verified=true&email={quote(user.email)}&role={quote(role_str)}"
                    )
                return Response(
                    {
                        "detail": "Email has already been verified.",
                        "user": {
                            "id": user.id,
                            "email": user.email,
                            "username": user.username,
                            "role": user.role,
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if is_html:
                return HttpResponseRedirect(f"{frontend_url}/verify-email?error=invalid_token")
            raise exc

        role_str = str(user.role).lower()
        if is_html:
            return HttpResponseRedirect(
                f"{frontend_url}/login?verified=true&email={quote(user.email)}&role={quote(role_str)}"
            )

        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "message": "Email verified successfully. Your account is now active.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                    "role": user.role,
                },
            },
            status=status.HTTP_200_OK,
        )


class LegacyEmailVerificationView(EmailVerificationLinkView):
    """Compatibility endpoint for the original POST verification contract."""

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "message": "Email verified successfully. Your account is now active.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "username": user.username,
                    "role": user.role,
                },
            },
            status=status.HTTP_200_OK,
        )


class ResendVerificationView(GenericAPIView):
    """
    Resend email verification link.
    """

    permission_classes = [AllowAny]
    serializer_class = ResendVerificationSerializer
    throttle_classes = [AnonRateThrottle]

    @extend_schema(
        tags=["Authentication"],
        summary="Resend Verification Email",
        description="Resend account verification email to user",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Resend Verification",
                value={"email": "user@example.com"},
            )
        ]
    )
    def post(self, request):

        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            {
                "message": (
                    "A new verification email "
                    "has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetView(GenericAPIView):
    """
    Request a password reset email (Task 2.5).

    ``POST /api/auth/password-reset/`` with ``{"email": ...}`` in the body.
    """

    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer
    throttle_classes = [AnonRateThrottle]

    @extend_schema(
        tags=["Authentication"],
        summary="Request Password Reset",
        description="Request a password reset email (Task 2.5)",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Request Password Reset",
                value={"email": "user@example.com"},
            )
        ]
    )
    def post(self, request):

        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            {
                "message": (
                    "If an account exists with this "
                    "email, a password reset link "
                    "has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(GenericAPIView):
    """
    Confirm a password reset (Task 2.5).

    ``POST /api/auth/password-reset-confirm/<uid>/<token>/`` with
    ``{"password": ..., "password_confirm": ...}`` in the body.
    """

    permission_classes = [AllowAny]
    serializer_class = ResetPasswordSerializer
    throttle_classes = [AnonRateThrottle]

    @extend_schema(
        tags=["Authentication"],
        summary="Confirm Password Reset",
        description="Set a new password using the reset token (Task 2.5)",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Confirm Password Reset",
                value={
                    "password": "newSecurePassword123",
                    "password_confirm": "newSecurePassword123",
                },
            )
        ]
    )
    def post(self, request, uid, token):

        data = request.data.copy()
        data["uid"] = uid
        data["token"] = token

        serializer = self.get_serializer(
            data=data
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            {
                "message": "Password reset successfully."
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(GenericAPIView):
    """
    Change password for the authenticated user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    @extend_schema(
        tags=["Authentication"],
        summary="Change Password",
        description="Change password for the currently logged in user",
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'message': {'type': 'string'}
                }
            }
        },
        examples=[
            OpenApiExample(
                "Change Password",
                value={
                    "old_password": "oldPassword123",
                    "new_password": "newSecurePassword123"
                },
            )
        ]
    )
    def post(self, request):

        serializer = self.get_serializer(
            data=request.data,
            context={
                "request": request
            },
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            {
                "message": "Password changed successfully."
            },
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Track 1 Institutional Staff & Academic Advisor Approval Views
# =============================================================================

from django.shortcuts import get_object_or_404
from django.utils import timezone
from .permissions import IsSystemAdmin, IsUILOfficer


@extend_schema(tags=["Administration"])
class AdminPendingStaffListView(APIView):
    """
    List institutional staff users for administrator review and verification.
    Returns all institutional staff (UIL Officer, Department Dean, Student Union, Dorm Admin, Finance Officer).
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        pending_roles = [
            User.Role.DEPT_DEAN,
            User.Role.UIL_OFFICER,
            User.Role.STUDENT_UNION,
            User.Role.DORM_ADMIN,
            User.Role.FINANCE_OFFICER,
        ]
        queryset = User.objects.filter(role__in=pending_roles)
        status_param = request.query_params.get("status", "").strip().lower()
        if status_param == "pending":
            queryset = queryset.filter(is_approved=False)
        elif status_param == "approved":
            queryset = queryset.filter(is_approved=True)

        # Pending unapproved accounts (is_approved=False) appear first, ordered by newest created
        users = queryset.order_by("is_approved", "-created_at")
        serializer = UserDetailSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["Administration"])
class AdminApproveStaffView(APIView):
    """
    Approve and verify an institutional staff member.
    """
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        user.is_approved = True
        user.approved_by = request.user
        user.approved_at = timezone.now()
        user.is_active = True
        user.is_email_verified = True
        user.save()

        # In-app verification alert notification for approved actor
        try:
            from apps.notifications.services import create_notification
            from apps.notifications.models import Notification
            role_title = dict(User.Role.choices).get(user.role, user.role)
            create_notification(
                recipient=user,
                actor=request.user,
                title="Institutional Account Verified & Approved",
                message=(
                    f"Your institutional account as {role_title} at {user.university_name or 'your university'} "
                    f"has been officially verified and approved by the Platform Administrator. "
                    f"You now have full institutional operational authority."
                ),
                notification_type=Notification.NotificationType.VERIFICATION,
                link=f"/{str(user.role).lower().replace('_', '')}/dashboard",
                metadata={
                    "approved_by": request.user.email,
                    "approved_at": timezone.now().isoformat(),
                    "role": user.role,
                    "university": user.university_name,
                },
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Failed to create verification notification: %s", exc)

        return Response(
            {
                "message": f"Staff user {user.email} verified and approved successfully.",
                "user": UserDetailSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["UIL"])
class UILPendingAdvisorsListView(APIView):
    """
    List academic advisor users pending UIL Officer approval.
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def get(self, request):
        advisors = User.objects.filter(role=User.Role.ADVISOR, is_approved=False).order_by("-created_at")
        serializer = UserDetailSerializer(advisors, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["UIL"])
class UILApproveAdvisorView(APIView):
    """
    Approve an academic advisor user.
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id, role=User.Role.ADVISOR)
        user.is_approved = True
        user.approved_by = request.user
        user.approved_at = timezone.now()
        user.is_active = True
        user.is_email_verified = True
        user.save()
        return Response(
            {
                "message": f"Academic Advisor {user.email} approved successfully.",
                "user": UserDetailSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

