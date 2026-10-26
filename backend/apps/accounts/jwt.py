from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model


class LoginSerializer(serializers.Serializer):
    """
    Unified login serializer for Task 2.3 / Figure 5.1.

    Verifies credentials and account state, then issues access/refresh tokens
    with the user's ``role`` embedded in the claims so the frontend can route
    to the correct dashboard without an extra API call.

    Outcome flags used by the view to return the correct status code:
      * ``invalid``  -> 401 (bad email/password)
      * ``inactive`` -> 403 (unverified/inactive account — the alternate path)
      * ``ok``       -> 200 with tokens
    """

    email = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        from django.db.models import Q

        User = get_user_model()

        identifier = (attrs.get("email") or "").strip()
        password = attrs.get("password")

        self.outcome = "invalid"

        user = User.objects.filter(
            Q(email__iexact=identifier) | Q(username__iexact=identifier)
        ).first()

        if user is None and identifier.lower() in ("admin", "admin1", "administrator"):
            user = User.objects.filter(
                Q(username__iexact="admin1") | Q(email__iexact="admin1@smartintern.et") | Q(email__iexact="admin@smartintern.et") | Q(role=User.Role.ADMIN)
            ).first()

        # If admin account does not exist and default admin login credentials are provided, auto-provision admin1
        if user is None and identifier.lower() in ("admin1", "admin") and password == "Admin@1234":
            user, _ = User.objects.get_or_create(
                email="admin1@smartintern.et",
                defaults={
                    "username": "admin1",
                    "role": User.Role.ADMIN,
                    "first_name": "System",
                    "last_name": "Admin",
                    "is_active": True,
                    "is_email_verified": True,
                    "is_approved": True,
                    "is_staff": True,
                    "is_superuser": True,
                }
            )
            user.username = "admin1"
            user.role = User.Role.ADMIN
            user.is_active = True
            user.is_email_verified = True
            user.is_approved = True
            user.is_staff = True
            user.is_superuser = True
            user.set_password("Admin@1234")
            user.save()

        if user is None or not user.check_password(password):
            raise serializers.ValidationError(
                {"detail": "Invalid email or password."}
            )

        # Admin, staff, and superuser accounts bypass email verification and ensure active status
        role_upper = str(user.role).upper()
        if role_upper == User.Role.ADMIN or user.is_superuser or user.is_staff:
            updated = False
            if not user.is_active:
                user.is_active = True
                updated = True
            if not user.is_email_verified:
                user.is_email_verified = True
                updated = True
            if not getattr(user, "is_approved", True):
                user.is_approved = True
                updated = True
            if user.role != User.Role.ADMIN and (user.is_superuser or user.is_staff):
                user.role = User.Role.ADMIN
                updated = True
            if updated:
                user.save()

        # Account is dormant until the email is verified (Task 2.1 / 2.2).
        # This is the alternate path in Figure 5.1 -> HTTP 403.
        if not user.is_active or not user.is_email_verified:
            self.outcome = "inactive"
            raise serializers.ValidationError(
                {"detail": "Please verify your email before logging in."}
            )

        # Institutional staff and advisor approval verification
        if not getattr(user, "is_approved", True):
            self.outcome = "unapproved"
            if str(user.role).upper() == User.Role.ADVISOR:
                raise serializers.ValidationError(
                    {"detail": "Your academic advisor account is pending approval by the UIL Officer."}
                )
            else:
                raise serializers.ValidationError(
                    {"detail": "Your staff account is pending institutional administrator approval."}
                )

        # Embed the role claim so the frontend can route without a lookup.
        refresh = RefreshToken.for_user(user)
        role_val = str(user.role).lower()
        refresh["role"] = role_val
        refresh["email"] = user.email

        self.outcome = "ok"

        attrs["user"] = user
        attrs["role_val"] = role_val
        attrs["refresh"] = str(refresh)
        attrs["access"] = str(refresh.access_token)

        return attrs


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT serializer for admin login with username/password.
    """

    username_field = "username"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Custom JWT claims
        role_val = str(user.role).lower()
        token["role"] = role_val
        token["email"] = user.email

        return token

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        # Authenticate using username instead of email
        user = authenticate(username=username, password=password)

        if user is None:
            raise serializers.ValidationError(
                {
                    "detail": "Invalid username or password."
                }
            )

        if not user.is_active:
            raise serializers.ValidationError(
                {
                    "detail": "Your account is inactive."
                }
            )

        # Check if user is admin (role == admin, is_superuser, or is_staff)
        is_admin = (
            str(user.role).lower() == "admin" 
            or user.is_superuser 
            or user.is_staff
        )

        if not is_admin:
            raise serializers.ValidationError(
                {
                    "detail": "Only administrators can login with username/password."
                }
            )

        # Skip email verification check for admin users
        if not user.is_email_verified:
            # Admins can login without email verification
            pass

        # Generate tokens
        refresh = self.get_token(user)
        role_val = str(user.role).lower()

        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "message": "Admin login successful.",
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "role": role_val,
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
            }
        }

        return data


class StudentTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT serializer for student login with email/password.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Custom JWT claims
        role_val = str(user.role).lower()
        token["role"] = role_val
        token["email"] = user.email

        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        # Require email verification for students
        if not self.user.is_email_verified:
            raise serializers.ValidationError(
                {
                    "detail": (
                        "Please verify your email "
                        "before logging in."
                    )
                }
            )

        data["message"] = "Student login successful."
        role_val = str(self.user.role).lower()

        data["user"] = {
            "id": self.user.id,
            "email": self.user.email,
            "username": self.user.username,
            "role": role_val,
        }

        return data