import base64
import hashlib
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from pgvector.django import HnswIndex, VectorField

# Ethiopian Phone Validator
ethiopian_phone_validator = RegexValidator(
    regex=r"^(\+251[79]\d{8}|0[79]\d{8})$",
    message="Phone number must be a valid Ethiopian phone number (e.g., +251912345678 or 0912345678).",
)


def get_fernet_cipher():
    key_material = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_material))


class EncryptedTextField(models.TextField):
    """
    TextField that stores data encrypted at rest via Fernet symmetric encryption.
    """

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        try:
            cipher = get_fernet_cipher()
            return cipher.decrypt(value.encode("utf-8")).decode("utf-8")
        except Exception:
            return value

    def to_python(self, value):
        if not value:
            return value
        try:
            cipher = get_fernet_cipher()
            return cipher.decrypt(value.encode("utf-8")).decode("utf-8")
        except Exception:
            return value

    def get_prep_value(self, value):
        if not value:
            return value
        try:
            cipher = get_fernet_cipher()
            cipher.decrypt(value.encode("utf-8"))
            return value
        except Exception:
            cipher = get_fernet_cipher()
            return cipher.encrypt(value.encode("utf-8")).decode("utf-8")


class UniversityDepartment(models.Model):
    """
    University department entity for institutional staff and academic tracking.
    """

    university_name = models.CharField(
        max_length=255,
        verbose_name="University Name",
    )
    department_name = models.CharField(
        max_length=128,
        verbose_name="Department Name",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "University Department"
        verbose_name_plural = "University Departments"
        constraints = [
            models.UniqueConstraint(
                fields=["university_name", "department_name"],
                name="unique_university_department",
            )
        ]

    def __str__(self):
        return f"{self.department_name} ({self.university_name})"


class UILStudentProfile(models.Model):
    """
    Student safety, verification, and institutional profile linked directly to
    the existing Student model.

    Guardrail enforcement: NO skill_tags field exists on this model.
    Skills remain solely in Skill / StudentSkill tables queried via .student.
    """

    student = models.OneToOneField(
        "student_profiles.Student",
        on_delete=models.CASCADE,
        related_name="uil_student_profile",
        verbose_name="Existing Student Record",
    )
    student_id_number = models.CharField(
        max_length=64,
        verbose_name="Student University ID Number",
        help_text="Official university student identification number.",
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
    is_active_for_internship = models.BooleanField(
        default=False,
        verbose_name="Active For Internship Matching",
    )
    is_verified_by_dean = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Dean Verified",
        help_text="Whether Department Dean has officially verified student eligibility.",
    )
    dean_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Dean Verification Timestamp",
    )
    dean_signature_hash = models.CharField(
        max_length=128,
        blank=True,
        default="",
        verbose_name="Dean HMAC Signature Hash",
    )
    dean_verification_letter_qr = models.TextField(
        blank=True,
        default="",
        verbose_name="Dean Verification Letter Base64 QR",
    )
    dean_dorm_food_letter_qr = models.TextField(
        blank=True,
        default="",
        verbose_name="Dorm & Food Clearance Letter Base64 QR",
    )
    dean_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_uil_students",
        verbose_name="Verifying Department Dean",
    )
    dean_letter_title = models.CharField(
        max_length=255,
        blank=True,
        default="Official Institutional Clearance & Services Pass",
        verbose_name="Dean Letter Title",
    )
    dean_letter_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="Dean Clearance Notes & Remarks",
    )
    dean_allow_dorm = models.BooleanField(
        default=True,
        verbose_name="Dormitory Clearance Allowed",
    )
    dean_allow_food = models.BooleanField(
        default=True,
        verbose_name="Cafeteria Clearance Allowed",
    )
    dean_allow_internship = models.BooleanField(
        default=True,
        verbose_name="Internship Clearance Allowed",
    )
    dean_valid_from = models.DateField(
        null=True,
        blank=True,
        verbose_name="Clearance Valid From",
    )
    dean_valid_until = models.DateField(
        null=True,
        blank=True,
        verbose_name="Clearance Valid Until",
    )
    dean_letter_qr = models.TextField(
        blank=True,
        default="",
        verbose_name="Dean Custom Clearance Letter Base64 QR",
    )
    dean_unique_qr = models.TextField(
        blank=True,
        default="",
        verbose_name="Unified Department Dean Base64 QR Code",
        help_text="Single persistent QR code representing the Department Dean across all documents.",
    )
    internship_letter_sent = models.BooleanField(
        default=False,
        verbose_name="Internship Clearance Letter Dispatched",
    )
    internship_letter_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Internship Letter Sent Timestamp",
    )
    dorm_food_letter_title = models.CharField(
        max_length=255,
        blank=True,
        default="Official Campus Dormitory & Cafeteria Clearance Authorization",
        verbose_name="Dorm & Food Clearance Letter Title",
    )
    dorm_food_letter_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="Dorm & Food Clearance Statement & Guidelines",
    )
    dorm_food_letter_sent = models.BooleanField(
        default=False,
        verbose_name="Dorm & Food Letter Dispatched",
    )
    dorm_food_letter_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Dorm & Food Letter Sent Timestamp",
    )
    score_letter_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="Official Score Letter Remarks & Standing",
    )
    score_letter_sent = models.BooleanField(
        default=False,
        verbose_name="Score Letter / Roster Released",
    )
    score_letter_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Score Letter Sent Timestamp",
    )
    score_roster_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Score Roster Breakdown Data",
    )
    dean_score_roster_file = models.FileField(
        upload_to="dean_rosters/%Y/%m/",
        null=True,
        blank=True,
        verbose_name="Dean Score Roster Template Excel",
    )
    forwarded_to_uil = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Forwarded to UIL Officer",
    )
    forwarded_to_uil_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Forwarded to UIL Timestamp",
    )
    forwarded_to_dorm = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Forwarded to Dormitory Admin",
    )
    forwarded_to_dorm_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Forwarded to Dormitory Timestamp",
    )
    forwarded_to_student_dean = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Forwarded to Student Dean",
    )
    forwarded_to_student_dean_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Forwarded to Student Dean Timestamp",
    )
    embedding = VectorField(
        dimensions=384,
        null=True,
        blank=True,
        verbose_name="384-dim Hybrid Embedding Vector",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "UIL Student Profile"
        verbose_name_plural = "UIL Student Profiles"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student_id_number", "campus_city"],
                name="unique_student_id_per_campus",
            )
        ]
        indexes = [
            HnswIndex(
                name="uil_student_emb_hnsw_idx",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self):
        return f"{self.student_id_number} - {self.campus_city} ({self.department})"

    @property
    def user(self):
        """Helper returning the underlying User model through legacy Student relation."""
        if hasattr(self.student, "user"):
            return self.student.user
        return None


class EmergencyContact(models.Model):
    """
    Emergency contact details and optional university student insurance ID.
    Required before students depart for company placements or inter-city travel.
    """

    student_profile = models.OneToOneField(
        UILStudentProfile,
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"

    def __str__(self):
        return f"Emergency Contact for {self.student_profile.student_id_number}: {self.contact_name}"


class AccessibilityProfile(models.Model):
    """
    Accessibility accommodations profile for inclusive workplace onboarding.
    workplace_notes are stored encrypted at rest using cryptography.fernet.
    """

    student_profile = models.OneToOneField(
        UILStudentProfile,
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
    workplace_notes = EncryptedTextField(
        blank=True,
        default="",
        verbose_name="Confidential Workplace Accessibility Notes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Accessibility Profile"
        verbose_name_plural = "Accessibility Profiles"

    def __str__(self):
        return f"Accessibility Profile for {self.student_profile.student_id_number}"


class StaffProfile(models.Model):
    """
    Staff profile for institutional actors and company supervisors.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
    )
    department = models.ForeignKey(
        UniversityDepartment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_members",
    )
    staff_role = models.CharField(
        max_length=30,
        verbose_name="Staff Institutional Role",
    )
    staff_id_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        verbose_name="Staff / Employee ID Number",
        help_text="Unique institutional staff or employee identification number.",
    )
    phone_number = models.CharField(
        max_length=20,
        validators=[ethiopian_phone_validator],
        blank=True,
        null=True,
        verbose_name="Ethiopian Contact Phone",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Staff Profile"
        verbose_name_plural = "Staff Profiles"

    def __str__(self):
        return f"{self.user.email} - {self.staff_role}"


class Resume(models.Model):
    """
    Resume document upload and structured parsing extraction record.
    Linked to UILStudentProfile via student FK.

    Guardrail enforcement:
    This is a separate parsing model that holds raw extracted text and proposed
    parsed_data JSON. It never overwrites Student.resume or any student profile
    fields without explicit user confirmation.
    """

    class ParsingStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    student = models.ForeignKey(
        UILStudentProfile,
        on_delete=models.CASCADE,
        related_name="resumes",
        verbose_name="UIL Student Profile",
    )
    file = models.FileField(
        upload_to="resumes/%Y/%m/",
        verbose_name="Resume File",
    )
    extracted_text = models.TextField(
        blank=True,
        default="",
        verbose_name="Extracted Plain Text",
    )
    parsing_status = models.CharField(
        max_length=20,
        choices=ParsingStatus.choices,
        default=ParsingStatus.PENDING,
        db_index=True,
        verbose_name="Parsing Status",
    )
    parsed_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Parsed Data Suggestions",
    )
    error_message = models.TextField(
        blank=True,
        default="",
        verbose_name="Parsing Error Message",
    )
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Uploaded At",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Updated At",
    )

    class Meta:
        verbose_name = "Resume Document"
        verbose_name_plural = "Resume Documents"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Resume #{self.id} for {self.student.student_id_number} [{self.parsing_status}]"

