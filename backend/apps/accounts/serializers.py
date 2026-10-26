from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from .tokens import email_verification_token
from .services import (
    create_student_user,
    create_user_with_role,
    send_verification_email,
    send_password_reset_email,
    validate_email_address,
)
from .models import (
    StudentProfile,
    EmergencyContact,
    AccessibilityProfile,
    ethiopian_phone_validator,
)

User = get_user_model()


class StudentRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for role-based user registration (Student, Company HR, Academic Advisor).

    Accepts ``full_name``, ``email``, ``password``, ``role``, and optional
    role-specific fields (``organization_name``, ``department``, ``university_name``).
    The account is created INACTIVE and only activated once the email is verified.
    """

    ALLOWED_ROLES = {
        "student": User.Role.STUDENT,
        "company_hr": User.Role.COMPANY_HR,
        "company": User.Role.COMPANY_HR,
        "employer": User.Role.COMPANY_HR,
        "advisor": User.Role.ADVISOR,
        "company_mentor": User.Role.COMPANY_MENTOR,
        "mentor": User.Role.COMPANY_MENTOR,
        "dept_dean": User.Role.DEPT_DEAN,
        "dean": User.Role.DEPT_DEAN,
        "uil_officer": User.Role.UIL_OFFICER,
        "uil": User.Role.UIL_OFFICER,
        "student_union": User.Role.STUDENT_UNION,
        "union": User.Role.STUDENT_UNION,
        "dorm_admin": User.Role.DORM_ADMIN,
        "dorm": User.Role.DORM_ADMIN,
        "finance_officer": User.Role.FINANCE_OFFICER,
        "finance": User.Role.FINANCE_OFFICER,
    }

    full_name = serializers.CharField(
        write_only=True,
        required=False,
    )

    role = serializers.CharField(
        write_only=True,
        required=False,
        default="student",
    )

    organization_name = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    department = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    university_name = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    staff_id_number = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    password = serializers.CharField(
        write_only=True,
    )

    password_confirm = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    phone = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    username = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    auto_activate = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )

    class Meta:
        model = User

        fields = (
            "full_name",
            "email",
            "username",
            "role",
            "phone",
            "organization_name",
            "department",
            "university_name",
            "staff_id_number",
            "password",
            "password_confirm",
            "auto_activate",
        )

    def validate(self, attrs):
        # 1. Full name check
        full_name = attrs.get("full_name", "").strip()
        if not full_name:
            raise serializers.ValidationError({"full_name": "Full name is required."})

        # 2. Role validation
        role_raw = (attrs.get("role") or "student").strip().lower()
        if role_raw in ("admin", "administrator"):
            raise serializers.ValidationError({
                "role": "Administrator registration is not permitted. Please log in with existing administrator credentials."
            })
        if role_raw not in self.ALLOWED_ROLES:
            allowed_list = ", ".join(self.ALLOWED_ROLES.keys())
            raise serializers.ValidationError({
                "role": f"Invalid role '{role_raw}'. Allowed registration roles are: {allowed_list}."
            })
        attrs["role"] = role_raw

        # 3. Role-specific validation
        if role_raw in ("company_hr", "company", "company_mentor", "mentor"):
            org = (attrs.get("organization_name") or "").strip()
            if not org:
                raise serializers.ValidationError({
                    "organization_name": "Company / Organization name is required for employer registration."
                })

        if role_raw in ("advisor", "dept_dean", "dean"):
            dept = (attrs.get("department") or "").strip()
            uni = (attrs.get("university_name") or "").strip()
            if not uni:
                raise serializers.ValidationError({
                    "university_name": "University name is required for this academic role."
                })
            if not dept:
                raise serializers.ValidationError({
                    "department": "Department is required for this academic role."
                })
            staff_id = (attrs.get("staff_id_number") or "").strip()
            if staff_id:
                if User.objects.filter(staff_id_number=staff_id, university_name__iexact=uni).exists():
                    raise serializers.ValidationError({
                        "staff_id_number": f"Staff ID '{staff_id}' is already registered at {uni}."
                    })

        if role_raw in ("uil_officer", "uil", "student_union", "union", "dorm_admin", "dorm", "finance_officer", "finance"):
            uni = (attrs.get("university_name") or "").strip()
            if not uni:
                raise serializers.ValidationError({
                    "university_name": "University name is required for institutional staff registration."
                })
            staff_id = (attrs.get("staff_id_number") or "").strip()
            if role_raw in ("dorm_admin", "dorm", "student_union", "union") and not staff_id:
                raise serializers.ValidationError({
                    "staff_id_number": "Staff ID Number is required for Dormitory Administration and Student Dean registration."
                })
            if staff_id:
                if User.objects.filter(staff_id_number=staff_id, university_name__iexact=uni).exists():
                    raise serializers.ValidationError({
                        "staff_id_number": f"Staff ID '{staff_id}' is already registered at {uni}."
                    })

        # 4. Password validation
        if attrs.get("password_confirm"):
            if attrs["password"] != attrs["password_confirm"]:
                raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        validate_password(
            attrs["password"],
            user=User(
                email=attrs.get("email"),
                username=attrs.get("username"),
            ),
        )

        # 5. Email deliverability/format
        if not validate_email_address(attrs["email"]):
            raise serializers.ValidationError({
                "email": "Please provide a valid email address with a real domain."
            })

        return attrs

    def create(self, validated_data):
        from django.db import transaction
        from apps.students.models import StudentProfile

        validated_data.pop("password_confirm", None)

        full_name = validated_data.pop("full_name", "").strip()
        parts = full_name.split(maxsplit=1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""

        phone = validated_data.pop("phone", "")
        role_raw = validated_data.pop("role", "student")
        auto_activate = validated_data.pop("auto_activate", False)
        target_role = self.ALLOWED_ROLES.get(role_raw, User.Role.STUDENT)

        org_name = (validated_data.pop("organization_name", "") or "").strip()
        dept_name = (validated_data.pop("department", "") or "").strip()
        uni_name = (validated_data.pop("university_name", "") or "").strip()
        staff_id_num = (validated_data.pop("staff_id_number", "") or "").strip()

        with transaction.atomic():
            if target_role == User.Role.STUDENT:
                user = create_student_user(
                    email=validated_data["email"],
                    username=validated_data.get("username") or None,
                    password=validated_data["password"],
                    first_name=first_name,
                    last_name=last_name,
                )
                if phone:
                    user.phone_number = phone
                if uni_name:
                    user.university_name = uni_name
                if dept_name:
                    user.department = dept_name
                # Accounts require email verification before activation
                user.is_active = False
                user.is_email_verified = False
                user.is_approved = True
                user.save()

                # Empty StudentProfile shell completes during onboarding
                from apps.students.models import StudentProfile as LegacyStudentProfile
                from apps.students.models import Student as LegacyStudent
                from apps.uil_profiles.models import UILStudentProfile

                dept_slug = ""
                if dept_name:
                    for code, label in LegacyStudentProfile.FIELD_OF_STUDY_CHOICES:
                        if code == dept_name.lower().replace(" ", "_") or label.lower() == dept_name.lower():
                            dept_slug = code
                            break
                    if not dept_slug:
                        dept_slug = dept_name

                LegacyStudentProfile.objects.create(
                    user=user,
                    phone=phone,
                    university=uni_name or "",
                    field_of_study=dept_slug,
                )
                legacy_stu, _ = LegacyStudent.objects.get_or_create(user=user)
                if dept_name:
                    legacy_stu.field_of_study = dept_name
                    legacy_stu.save()
                uil_prof, _ = UILStudentProfile.objects.get_or_create(
                    student=legacy_stu,
                    defaults={
                        "student_id_number": f"UGR/{user.id.hex[:4].upper()}/16",
                        "department": dept_name or "Computer Science",
                        "academic_year": 4,
                        "campus_city": uni_name or "Addis Ababa",
                    }
                )
                if dept_name and uil_prof.department != dept_name:
                    uil_prof.department = dept_name
                    uil_prof.save()
            else:
                user = create_user_with_role(
                    email=validated_data["email"],
                    username=validated_data.get("username") or None,
                    password=validated_data["password"],
                    role=target_role,
                    first_name=first_name,
                    last_name=last_name,
                    phone=phone,
                    department=dept_name,
                    university_name=uni_name,
                    staff_id_number=staff_id_num,
                    auto_activate=False,
                    is_approved=False if target_role in (User.Role.DORM_ADMIN, User.Role.STUDENT_UNION, User.Role.DEPT_DEAN, User.Role.UIL_OFFICER, User.Role.ADVISOR, User.Role.FINANCE_OFFICER) else True,
                )

                if target_role in (User.Role.COMPANY_HR, User.Role.COMPANY_MENTOR) and org_name:
                    try:
                        from apps.companies.models import Company, CompanyProfile
                        comp, _ = Company.objects.get_or_create(name=org_name)
                        CompanyProfile.objects.get_or_create(
                            company=comp,
                            defaults={
                                "contact_person": full_name or user.email,
                                "contact_email": user.email,
                                "contact_phone": phone or "",
                            },
                        )
                    except Exception:
                        pass

                if target_role in (
                    User.Role.DEPT_DEAN,
                    User.Role.UIL_OFFICER,
                    User.Role.ADVISOR,
                    User.Role.STUDENT_UNION,
                    User.Role.DORM_ADMIN,
                    User.Role.FINANCE_OFFICER,
                ):
                    try:
                        from apps.uil_profiles.models import StaffProfile, UniversityDepartment
                        dept_obj = None
                        if uni_name or dept_name:
                            dept_obj, _ = UniversityDepartment.objects.get_or_create(
                                university_name=uni_name or "Default University",
                                department_name=dept_name or "General Department",
                            )
                        StaffProfile.objects.get_or_create(
                            user=user,
                            defaults={
                                "staff_role": target_role,
                                "department": dept_obj,
                                "staff_id_number": staff_id_num,
                            }
                        )
                    except Exception:
                        pass

                if target_role == User.Role.ADMIN:
                    user.is_staff = True
                    user.is_superuser = True
                    user.is_approved = True
                    user.is_active = True
                    user.is_email_verified = True
                    user.save()

        if target_role != User.Role.ADMIN:
            email_sent = send_verification_email(user)
            if not email_sent:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Verification email failed to send to {user.email}")

        return user



class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the authenticated user.
    """
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = User

        fields = (
            "id",
            "email",
            "username",
            "role",
            "first_name",
            "last_name",
            "phone_number",
            "department",
            "university_name",
            "is_approved",
            "profile_photo",
            "profile_photo_url",
            "date_joined",
        )

    def get_profile_photo_url(self, obj):
        if obj.profile_photo:
            return obj.profile_photo.url
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("role"):
            data["role"] = str(data["role"]).lower()
        return data


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Writable serializer for authenticated user profile updates
    (profile photo, name, university, staff ID). Used by PATCH /api/v1/auth/me/.
    """

    class Meta:
        model = User

        fields = (
            "first_name",
            "last_name",
            "profile_photo",
            "university_name",
            "department",
            "staff_id_number",
            "phone_number",
        )

    def validate(self, attrs):
        uni = attrs.get("university_name") or getattr(self.instance, "university_name", "")
        staff_id = attrs.get("staff_id_number")
        if staff_id and uni and self.instance:
            conflict = User.objects.filter(
                staff_id_number=staff_id, university_name__iexact=uni
            ).exclude(id=self.instance.id)
            if conflict.exists():
                raise serializers.ValidationError({
                    "staff_id_number": f"Staff ID '{staff_id}' is already registered at {uni}."
                })
        return attrs

    def update(self, instance, validated_data):
        user = super().update(instance, validated_data)
        if hasattr(user, "staff_profile") and user.staff_profile:
            staff_profile = user.staff_profile
            updated = False
            if user.staff_id_number and staff_profile.staff_id_number != user.staff_id_number:
                staff_profile.staff_id_number = user.staff_id_number
                updated = True
            if user.phone_number and staff_profile.phone_number != user.phone_number:
                staff_profile.phone_number = user.phone_number
                updated = True
            if updated:
                staff_profile.save()
        return user

    def validate_profile_photo(self, value):
        """Validate profile photo file type and size."""
        if value:
            # Check file size (max 5MB)
            max_size = 5 * 1024 * 1024  # 5MB
            if value.size > max_size:
                raise serializers.ValidationError(
                    "Profile photo must be less than 5MB."
                )
            
            # Check file type
            allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            if value.content_type not in allowed_types:
                raise serializers.ValidationError(
                    "Profile photo must be a JPEG, PNG, GIF, or WebP image."
                )
        return value

class LogoutSerializer(serializers.Serializer):
    """
    Logout by blacklisting the refresh token.
    """

    refresh = serializers.CharField()

    def validate(self, attrs):

        self.token = attrs["refresh"]

        return attrs

    def save(self, **kwargs):

        try:
            token = RefreshToken(self.token)

            token.blacklist()

        except Exception:
            raise serializers.ValidationError(
                {
                    "refresh": "Invalid or expired refresh token."
                }
            )

class EmailVerificationSerializer(serializers.Serializer):
    """
    Verify a user's email address.
    """

    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):


        User = get_user_model()

        try:
            user_id = urlsafe_base64_decode(
                attrs["uid"]
            ).decode()

            user = User.objects.get(
                pk=user_id
            )

        except (
            TypeError,
            ValueError,
            OverflowError,
            User.DoesNotExist,
        ):
            raise serializers.ValidationError(
                {
                    "detail": "Invalid verification link."
                }
            )

        # Single-use enforcement (Task 2.2): a token that has already been
        # redeemed must not succeed again.
        if user.is_email_verified:
            raise serializers.ValidationError(
                {
                    "detail": "Email has already been verified."
                }
            )

        if not email_verification_token.check_token(
            user,
            attrs["token"],
        ):
            raise serializers.ValidationError(
                {
                    "detail": "Invalid or expired verification token."
                }
            )

        attrs["user"] = user

        return attrs

    def save(self, **kwargs):

        user = self.validated_data["user"]

        user.is_email_verified = True

        # Activate the account now that the email is confirmed (Task 2.1).
        user.is_active = True

        # Auto-approve students, employers, mentors, and administrators upon email verification.
        # Institutional staff (dean, uil, union, dorm) require Admin approval. Advisors require UIL approval.
        role_upper = str(user.role).upper()
        if role_upper in (User.Role.STUDENT, User.Role.COMPANY_HR, User.Role.COMPANY_MENTOR, User.Role.ADMIN):
            user.is_approved = True

        user.save(
            update_fields=["is_email_verified", "is_active", "is_approved"]
        )

        return user


class ResendVerificationSerializer(serializers.Serializer):
    """
    Resend the email verification link.
    """

    email = serializers.EmailField()

    def validate(self, attrs):

        email = attrs["email"]

        # Validate that the email is real and can receive emails
        if not validate_email_address(email):
            raise serializers.ValidationError(
                {
                    "email": "Please provide a valid email address with a real domain."
                }
            )

        try:
            user = User.objects.get(
                email=email
            )
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {
                    "email": "No account found with this email."
                }
            )

        if user.is_email_verified:
            raise serializers.ValidationError(
                {
                    "email": "This email is already verified."
                }
            )

        attrs["user"] = user

        return attrs

    def save(self, **kwargs):

        user = self.validated_data["user"]

        send_verification_email(user)

        return user


class ForgotPasswordSerializer(serializers.Serializer):
    """
    Request a password reset email.
    """

    email = serializers.EmailField()

    def validate(self, attrs):

        email = attrs["email"]

        # Validate that the email is real and can receive emails
        if not validate_email_address(email):
            raise serializers.ValidationError(
                {
                    "email": "Please provide a valid email address with a real domain."
                }
            )

        try:
            user = User.objects.get(
                email=email
            )
        except User.DoesNotExist:
            user = None

        attrs["user"] = user

        return attrs

    def save(self, **kwargs):

        user = self.validated_data["user"]

        if user is not None:
            send_password_reset_email(user)

        return user


class ResetPasswordSerializer(serializers.Serializer):
    """
    Reset a user's password using a valid reset token.
    """

    uid = serializers.CharField()
    token = serializers.CharField()

    password = serializers.CharField(
        write_only=True
    )

    password_confirm = serializers.CharField(
        write_only=True
    )

    def validate(self, attrs):

        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {
                    "password_confirm":
                    "Passwords do not match."
                }
            )

        try:
            user_id = force_str(
                urlsafe_base64_decode(
                    attrs["uid"]
                )
            )

            user = User.objects.get(
                pk=user_id
            )

        except (
            TypeError,
            ValueError,
            OverflowError,
            User.DoesNotExist,
        ):
            raise serializers.ValidationError(
                {
                    "detail":
                    "Invalid password reset link."
                }
            )

        if not default_token_generator.check_token(
            user,
            attrs["token"],
        ):
            raise serializers.ValidationError(
                {
                    "detail":
                    "Invalid or expired password reset token."
                }
            )

        try:
            validate_password(
                attrs["password"],
                user=user,
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError(
                {
                    "password": exc.messages
                }
            )

        attrs["user"] = user

        return attrs

    def save(self, **kwargs):

        user = self.validated_data["user"]

        user.set_password(
            self.validated_data["password"]
        )

        user.save(
            update_fields=["password"]
        )

        return user


class ChangePasswordSerializer(serializers.Serializer):
    """
    Change password for the authenticated user.
    """

    old_password = serializers.CharField(
        write_only=True
    )

    new_password = serializers.CharField(
        write_only=True
    )

    new_password_confirm = serializers.CharField(
        write_only=True
    )

    def validate(self, attrs):

        user = self.context["request"].user

        # Check current password
        if not user.check_password(
            attrs["old_password"]
        ):
            raise serializers.ValidationError(
                {
                    "old_password":
                    "Current password is incorrect."
                }
            )

        # Check new passwords match
        if (
            attrs["new_password"]
            != attrs["new_password_confirm"]
        ):
            raise serializers.ValidationError(
                {
                    "new_password_confirm":
                    "New passwords do not match."
                }
            )

        # Prevent using the same password
        if user.check_password(
            attrs["new_password"]
        ):
            raise serializers.ValidationError(
                {
                    "new_password":
                    "New password must be different from the current password."
                }
            )

        # Django password validation
        validate_password(
            attrs["new_password"],
            user=user,
        )

        return attrs

    def save(self, **kwargs):

        user = self.context["request"].user

        user.set_password(
            self.validated_data["new_password"]
        )

        user.save(
            update_fields=["password"]
        )

        return user


# =============================================================================
# SmartIntern-ET Core Authentication & Student Safety Serializers
# =============================================================================

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT TokenObtainPair serializer returning user claims:
    user_id, email, role, and full_name.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["user_id"] = str(user.id)
        token["email"] = user.email
        token["role"] = user.role
        token["full_name"] = user.full_name
        return token

    def validate(self, attrs):
        username = (attrs.get(self.username_field) or "").strip()
        password = attrs.get("password")

        from django.db.models import Q
        pre_user = User.objects.filter(
            Q(email__iexact=username) | Q(username__iexact=username)
        ).first()

        if pre_user and pre_user.check_password(password):
            role_upper = str(pre_user.role).upper()
            if role_upper == User.Role.ADMIN or pre_user.is_superuser or pre_user.is_staff:
                updated = False
                if not pre_user.is_active:
                    pre_user.is_active = True
                    updated = True
                if not pre_user.is_email_verified:
                    pre_user.is_email_verified = True
                    updated = True
                if not getattr(pre_user, "is_approved", True):
                    pre_user.is_approved = True
                    updated = True
                if pre_user.role != User.Role.ADMIN:
                    pre_user.role = User.Role.ADMIN
                    updated = True
                if updated:
                    pre_user.save()
            else:
                if not pre_user.is_email_verified:
                    raise serializers.ValidationError(
                        {"detail": "Please verify your email address before logging in."}
                    )
                if not getattr(pre_user, "is_approved", True):
                    if role_upper == User.Role.ADVISOR:
                        raise serializers.ValidationError(
                            {"detail": "Your academic advisor account is pending approval by the UIL Officer."}
                        )
                    else:
                        raise serializers.ValidationError(
                            {"detail": "Your staff account is pending institutional administrator approval."}
                        )

        data = super().validate(attrs)
        # Check approval status for institutional staff and advisors
        if not getattr(self.user, "is_approved", True):
            if str(self.user.role).upper() == self.user.Role.ADVISOR:
                raise serializers.ValidationError(
                    {"detail": "Your academic advisor account is pending approval by the UIL Officer."}
                )
            else:
                raise serializers.ValidationError(
                    {"detail": "Your staff account is pending institutional administrator approval."}
                )
        token = self.get_token(self.user)
        data["access"] = str(token.access_token)
        data["refresh"] = str(token)
        data["user"] = {
            "user_id": str(self.user.id),
            "email": self.user.email,
            "role": self.user.role,
            "full_name": self.user.full_name,
            "department": getattr(self.user, "department", ""),
            "university_name": getattr(self.user, "university_name", ""),
            "is_approved": getattr(self.user, "is_approved", True),
        }
        return data


class EmergencyContactSerializer(serializers.ModelSerializer):
    """
    Serializer for emergency contacts and insurance policy details.
    """

    class Meta:
        model = EmergencyContact
        fields = (
            "id",
            "contact_name",
            "relationship",
            "primary_phone",
            "alternate_phone",
            "insurance_policy_number",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AccessibilityProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for confidential accessibility accommodation requests.
    """

    class Meta:
        model = AccessibilityProfile
        fields = (
            "id",
            "requires_screen_reader",
            "mobility_assistance_required",
            "workplace_notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class StudentProfileSerializer(serializers.ModelSerializer):
    """
    Full student profile serializer with nested emergency contact and accessibility details.
    """
    emergency_contact = EmergencyContactSerializer(required=False)
    accessibility_profile = AccessibilityProfileSerializer(required=False)

    class Meta:
        model = StudentProfile
        fields = (
            "id",
            "student_id_number",
            "university_name",
            "campus_city",
            "department",
            "academic_year",
            "gpa",
            "github_url",
            "bio",
            "skill_tags",
            "is_active_for_internship",
            "emergency_contact",
            "accessibility_profile",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class RegisterSerializer(serializers.ModelSerializer):
    """
    Comprehensive registration serializer enforcing unique email and
    unique (student_id_number, university_name) combinations.
    """
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True)

    # Optional Student Profile fields
    student_id_number = serializers.CharField(required=False, allow_blank=True)
    university_name = serializers.CharField(required=False, allow_blank=True)
    campus_city = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    academic_year = serializers.IntegerField(required=False, default=3)
    gpa = serializers.DecimalField(max_digits=3, decimal_places=2, required=False, allow_null=True)
    github_url = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    skill_tags = serializers.ListField(child=serializers.CharField(), required=False, default=list)

    # Optional Emergency Contact fields
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_relationship = serializers.CharField(required=False, allow_blank=True)
    emergency_primary_phone = serializers.CharField(required=False, allow_blank=True)
    emergency_alternate_phone = serializers.CharField(required=False, allow_blank=True)
    insurance_policy_number = serializers.CharField(required=False, allow_blank=True)

    # Optional Accessibility fields
    requires_screen_reader = serializers.BooleanField(required=False, default=False)
    mobility_assistance_required = serializers.BooleanField(required=False, default=False)
    workplace_notes = serializers.CharField(required=False, allow_blank=True)

    # Optional Staff fields
    staff_role = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "password",
            "password_confirm",
            # Student fields
            "student_id_number",
            "university_name",
            "campus_city",
            "department",
            "academic_year",
            "gpa",
            "github_url",
            "bio",
            "skill_tags",
            # Emergency Contact
            "emergency_contact_name",
            "emergency_relationship",
            "emergency_primary_phone",
            "emergency_alternate_phone",
            "insurance_policy_number",
            # Accessibility
            "requires_screen_reader",
            "mobility_assistance_required",
            "workplace_notes",
            # Staff fields
            "staff_role",
        )
        read_only_fields = ("id",)

    def to_internal_value(self, data):
        # Support nested student_profile payload if provided
        data = data.copy() if hasattr(data, "copy") else dict(data)
        student_data = data.get("student_profile")
        if isinstance(student_data, dict):
            for k in [
                "student_id_number",
                "university_name",
                "campus_city",
                "department",
                "academic_year",
                "gpa",
                "github_url",
                "bio",
                "skill_tags",
            ]:
                if k in student_data and k not in data:
                    data[k] = student_data[k]

            ec_data = student_data.get("emergency_contact")
            if isinstance(ec_data, dict):
                data.setdefault("emergency_contact_name", ec_data.get("contact_name"))
                data.setdefault("emergency_relationship", ec_data.get("relationship"))
                data.setdefault("emergency_primary_phone", ec_data.get("primary_phone"))
                data.setdefault("emergency_alternate_phone", ec_data.get("alternate_phone"))
                data.setdefault("insurance_policy_number", ec_data.get("insurance_policy_number"))

            acc_data = student_data.get("accessibility_profile")
            if isinstance(acc_data, dict):
                data.setdefault("requires_screen_reader", acc_data.get("requires_screen_reader", False))
                data.setdefault("mobility_assistance_required", acc_data.get("mobility_assistance_required", False))
                data.setdefault("workplace_notes", acc_data.get("workplace_notes", ""))

        return super().to_internal_value(data)

    def validate(self, attrs):
        # 1. Enforce unique email check
        email = attrs.get("email", "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "A user with this email address already exists."})

        # 2. Check password matching if confirmation is provided
        password = attrs.get("password")
        password_confirm = attrs.get("password_confirm")
        if password_confirm and password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        # 3. Enforce UniqueConstraint on ('student_id_number', 'campus_city') for UILStudentProfile
        role = attrs.get("role", User.Role.STUDENT)
        student_id_number = (attrs.get("student_id_number") or "").strip()
        university_name = (attrs.get("university_name") or "").strip()
        campus_city = (attrs.get("campus_city") or "").strip()

        if role == User.Role.STUDENT and student_id_number:
            from apps.uil_profiles.utils import universities_match, get_student_profile_university
            from apps.uil_profiles.models import UILStudentProfile
            from apps.students.models import StudentProfile as LegacyStudentProfile

            target_univ = university_name or campus_city
            err_key = "student_profile" if "student_profile" in self.initial_data else "student_id_number"

            # 1. Check accounts.StudentProfile
            if target_univ:
                for sp in StudentProfile.objects.filter(student_id_number__iexact=student_id_number):
                    if universities_match(sp.university_name, target_univ):
                        raise serializers.ValidationError({
                            err_key: f"A student profile with ID '{student_id_number}' already exists for the specified university."
                        })

            # 2. Check UILStudentProfile
            for uil in UILStudentProfile.objects.filter(student_id_number__iexact=student_id_number):
                uil_univ = get_student_profile_university(uil)
                if (target_univ and universities_match(uil_univ, target_univ)) or (campus_city and uil.campus_city.lower() == campus_city.lower()):
                    raise serializers.ValidationError({
                        err_key: f"A student profile with ID '{student_id_number}' already exists for the specified university/campus."
                    })

            # 3. Check apps.students.models.StudentProfile
            if target_univ:
                for lsp in LegacyStudentProfile.objects.filter(student_id_number__iexact=student_id_number):
                    if universities_match(lsp.university, target_univ):
                        raise serializers.ValidationError({
                            err_key: f"A student profile with ID '{student_id_number}' already exists for the specified university."
                        })

        # 4. Validate emergency primary phone if provided
        emergency_primary_phone = attrs.get("emergency_primary_phone")
        if emergency_primary_phone:
            ethiopian_phone_validator(emergency_primary_phone)

        return attrs

    def create(self, validated_data):
        from django.db import transaction

        # Pop non-user fields
        validated_data.pop("password_confirm", None)
        staff_role = (validated_data.pop("staff_role", "") or "").strip()
        student_id_number = (validated_data.pop("student_id_number", "") or "").strip()
        university_name = (validated_data.pop("university_name", "") or "").strip()
        campus_city = (validated_data.pop("campus_city", "") or "").strip()
        department = (validated_data.pop("department", "") or "").strip()
        academic_year = validated_data.pop("academic_year", 3)
        gpa = validated_data.pop("gpa", None)
        github_url = validated_data.pop("github_url", None)
        bio = validated_data.pop("bio", "")
        skill_tags = validated_data.pop("skill_tags", [])

        # Emergency fields
        emergency_contact_name = validated_data.pop("emergency_contact_name", "").strip()
        emergency_relationship = validated_data.pop("emergency_relationship", "").strip()
        emergency_primary_phone = validated_data.pop("emergency_primary_phone", "").strip()
        emergency_alternate_phone = validated_data.pop("emergency_alternate_phone", "").strip()
        insurance_policy_number = validated_data.pop("insurance_policy_number", "").strip()

        # Accessibility fields
        requires_screen_reader = validated_data.pop("requires_screen_reader", False)
        mobility_assistance_required = validated_data.pop("mobility_assistance_required", False)
        workplace_notes = validated_data.pop("workplace_notes", "")

        password = validated_data.pop("password")

        with transaction.atomic():
            user = User.objects.create_user(password=password, **validated_data)
            user_updated = False
            if department:
                user.department = department
                user_updated = True
            if university_name:
                user.university_name = university_name
                user_updated = True
            if user_updated:
                user.save()

            if user.role == User.Role.STUDENT:
                from apps.students.models import Student as ExistingStudent
                from apps.uil_profiles.models import (
                    UILStudentProfile,
                    EmergencyContact as UILEmergencyContact,
                    AccessibilityProfile as UILAccessibilityProfile,
                )

                existing_student, _ = ExistingStudent.objects.get_or_create(user=user)
                uil_profile = UILStudentProfile.objects.create(
                    student=existing_student,
                    student_id_number=student_id_number or f"SID-{user.id.hex[:8].upper()}",
                    campus_city=campus_city or "Addis Ababa",
                    department=department or "Software Engineering",
                    academic_year=academic_year or 3,
                    gpa=gpa,
                    github_url=github_url,
                )

                student_profile = StudentProfile.objects.create(
                    user=user,
                    student_id_number=student_id_number or f"SID-{user.id.hex[:8].upper()}",
                    university_name=university_name or "Unknown University",
                    campus_city=campus_city or "Addis Ababa",
                    department=department or "Software Engineering",
                    academic_year=academic_year or 3,
                    gpa=gpa,
                    github_url=github_url,
                    bio=bio,
                    skill_tags=skill_tags,
                )

                if emergency_contact_name and emergency_primary_phone:
                    EmergencyContact.objects.create(
                        student_profile=student_profile,
                        contact_name=emergency_contact_name,
                        relationship=emergency_relationship or "Family",
                        primary_phone=emergency_primary_phone,
                        alternate_phone=emergency_alternate_phone or None,
                        insurance_policy_number=insurance_policy_number or None,
                    )
                    UILEmergencyContact.objects.create(
                        student_profile=uil_profile,
                        contact_name=emergency_contact_name,
                        relationship=emergency_relationship or "Family",
                        primary_phone=emergency_primary_phone,
                        alternate_phone=emergency_alternate_phone or None,
                        insurance_policy_number=insurance_policy_number or None,
                    )

                if requires_screen_reader or mobility_assistance_required or workplace_notes:
                    AccessibilityProfile.objects.create(
                        student_profile=student_profile,
                        requires_screen_reader=requires_screen_reader,
                        mobility_assistance_required=mobility_assistance_required,
                        workplace_notes=workplace_notes,
                    )
                    UILAccessibilityProfile.objects.create(
                        student_profile=uil_profile,
                        requires_screen_reader=requires_screen_reader,
                        mobility_assistance_required=mobility_assistance_required,
                        workplace_notes=workplace_notes,
                    )
            elif user.role in (
                User.Role.DEPT_DEAN,
                User.Role.UIL_OFFICER,
                User.Role.ADVISOR,
                User.Role.STUDENT_UNION,
                User.Role.DORM_ADMIN,
                User.Role.COMPANY_HR,
                User.Role.COMPANY_MENTOR,
                User.Role.FINANCE_OFFICER,
            ):
                from apps.uil_profiles.models import StaffProfile, UniversityDepartment
                dept_obj = None
                if university_name or department:
                    dept_obj, _ = UniversityDepartment.objects.get_or_create(
                        university_name=university_name or "Default University",
                        department_name=department or "General",
                    )
                StaffProfile.objects.create(
                    user=user,
                    department=dept_obj,
                    staff_role=staff_role or user.role,
                    phone_number=user.phone_number,
                )

        return user


class UserDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for the currently authenticated user including profile details.
    """
    full_name = serializers.CharField(read_only=True)
    student_profile = StudentProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "phone_number",
            "department",
            "university_name",
            "staff_id_number",
            "role",
            "is_approved",
            "is_active",
            "is_staff",
            "is_email_verified",
            "profile_photo",
            "date_joined",
            "student_profile",
        )
        read_only_fields = ("id", "email", "role", "is_staff", "date_joined")