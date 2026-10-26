import uuid
from django.conf import settings
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

# ---------------------------------------------------------------------------
# Ethiopian Phone Number Validator
# Regex accepts +251 followed by 7 or 9 and 8 digits, or 0 followed by 7 or 9 and 8 digits
# ---------------------------------------------------------------------------
ethiopian_phone_validator = RegexValidator(
    regex=r"^(\+251[79]\d{8}|0[79]\d{8})$",
    message="Phone number must be a valid Ethiopian phone number (e.g., +251912345678 or 0912345678).",
)


class UserManager(BaseUserManager):
    """
    Custom user manager where email is the unique identifier for authentication.
    """

    def create_user(self, email, password=None, first_name="", last_name="", **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(
            email=email,
            first_name=first_name,
            last_name=last_name,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, first_name="Admin", last_name="User", **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", self.model.Role.ADMIN)
        extra_fields.setdefault("is_email_verified", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(
            email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            **extra_fields,
        )


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model for SmartIntern-ET.
    Supports 9 distinct university & company actors across Ethiopian institutions.
    """

    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        ADMIN = "ADMIN", "Administrator"
        DEPT_DEAN = "DEPT_DEAN", "Department Dean"
        UIL_OFFICER = "UIL_OFFICER", "UIL Head Officer"
        ADVISOR = "ADVISOR", "Academic Advisor"
        STUDENT_UNION = "STUDENT_UNION", "Student Union"
        DORM_ADMIN = "DORM_ADMIN", "Dormitory Admin"
        COMPANY_HR = "COMPANY_HR", "Company HR"
        COMPANY_MENTOR = "COMPANY_MENTOR", "Company Mentor"
        FINANCE_OFFICER = "FINANCE_OFFICER", "Finance Officer"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    email = models.EmailField(
        unique=True,
        max_length=255,
        verbose_name="Email Address",
    )

    username = models.CharField(
        max_length=150,
        blank=True,
        null=True,
    )

    first_name = models.CharField(
        max_length=150,
        blank=True,
    )

    last_name = models.CharField(
        max_length=150,
        blank=True,
    )

    phone_number = models.CharField(
        max_length=20,
        validators=[ethiopian_phone_validator],
        blank=True,
        null=True,
        verbose_name="Ethiopian Phone Number",
    )

    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.STUDENT,
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Designates whether this user account is active.",
    )

    is_staff = models.BooleanField(
        default=False,
        help_text="Designates whether the user can log into the admin site.",
    )

    is_email_verified = models.BooleanField(
        default=False,
    )

    profile_photo = models.ImageField(
        upload_to="profile_photos/",
        blank=True,
        null=True,
        verbose_name="Profile Photo",
    )

    is_approved = models.BooleanField(
        default=False,
        help_text="Designates whether this institutional staff or advisor user has been approved.",
    )

    approved_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_users",
        verbose_name="Approved By",
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Approval Timestamp",
    )

    department = models.CharField(
        max_length=128,
        blank=True,
        default="",
        verbose_name="Department Affiliation",
    )

    university_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="University Affiliation",
    )

    staff_id_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        verbose_name="Staff / Employee ID Number",
        help_text="Unique institutional staff or employee identification number.",
    )

    date_joined = models.DateTimeField(
        default=timezone.now,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return name if name else self.email

    def save(self, *args, **kwargs):
        # Auto-approve students, company HR/mentors, and administrators upon creation
        if self._state.adding and not self.is_approved:
            auto_approved_roles = {
                self.Role.STUDENT,
                self.Role.ADMIN,
                self.Role.COMPANY_HR,
                self.Role.COMPANY_MENTOR,
            }
            if self.role in auto_approved_roles or self.is_superuser or self.is_staff:
                self.is_approved = True
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Student Safety, Verification & Accessibility Models
# ---------------------------------------------------------------------------

class StudentProfile(models.Model):
    """
    Core academic profile for a student participating in SmartIntern-ET.
    Enforces uniqueness of (student_id_number, university_name) to prevent duplicate profiles.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )

    student_id_number = models.CharField(
        max_length=64,
        verbose_name="Student University ID Number",
        help_text="Official university student identification number.",
    )

    university_name = models.CharField(
        max_length=255,
        verbose_name="University Name",
    )

    campus_city = models.CharField(
        max_length=128,
        verbose_name="Campus City",
    )

    department = models.CharField(
        max_length=128,
        verbose_name="Department",
    )

    academic_year = models.IntegerField(
        default=3,
        verbose_name="Academic Year",
    )

    gpa = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Cumulative GPA",
    )

    github_url = models.URLField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="GitHub Profile URL",
    )

    bio = models.TextField(
        blank=True,
        default="",
        verbose_name="Bio / Summary",
    )

    skill_tags = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Skill Tags",
    )

    is_active_for_internship = models.BooleanField(
        default=False,
        verbose_name="Active For Internship Matching",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        verbose_name = "Student Profile"
        verbose_name_plural = "Student Profiles"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student_id_number", "university_name"],
                name="unique_student_id_per_university",
            )
        ]

    def __str__(self):
        return f"{self.user.email} - {self.student_id_number} ({self.university_name})"


class EmergencyContact(models.Model):
    """
    Emergency contact details and optional university student insurance ID.
    Required before students depart for company placements or inter-city travel.
    """

    student_profile = models.OneToOneField(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="emergency_contact",
    )

    contact_name = models.CharField(
        max_length=150,
        verbose_name="Contact Person Name",
    )

    relationship = models.CharField(
        max_length=100,
        verbose_name="Relationship to Student",
    )

    primary_phone = models.CharField(
        max_length=20,
        validators=[ethiopian_phone_validator],
        verbose_name="Primary Ethiopian Phone Number",
    )

    alternate_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name="Alternate Phone Number",
    )

    insurance_policy_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="Insurance Policy / Reference Number",
        help_text="Optional university student insurance policy reference ID.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"

    def __str__(self):
        return f"Emergency Contact for {self.student_profile.student_id_number}: {self.contact_name}"


class AccessibilityProfile(models.Model):
    """
    Accessibility accommodations profile for inclusive workplace onboarding.
    Privately shared with matched companies and campus facilities.
    """

    student_profile = models.OneToOneField(
        StudentProfile,
        on_delete=models.CASCADE,
        related_name="accessibility_profile",
    )

    requires_screen_reader = models.BooleanField(
        default=False,
        verbose_name="Requires Screen Reader",
    )

    mobility_assistance_required = models.BooleanField(
        default=False,
        verbose_name="Mobility / Wheelchair Assistance Required",
    )

    workplace_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="Confidential Workplace Accessibility Notes",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        verbose_name = "Accessibility Profile"
        verbose_name_plural = "Accessibility Profiles"

    def __str__(self):
        return f"Accessibility Profile for {self.student_profile.student_id_number}"