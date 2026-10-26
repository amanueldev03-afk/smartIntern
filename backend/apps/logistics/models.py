import uuid
import hmac
import hashlib
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


def generate_dean_signature(student_id_number: str, cohort_id: str, dean_user_id: str, timestamp_str: str) -> str:
    """
    Generates a cryptographic HMAC-SHA256 digital signature representing the Dean's official sign-off.
    """
    message = f"CAMPUS_LOGISTICS_CLEARANCE:{student_id_number}:{cohort_id}:{dean_user_id}:{timestamp_str}"
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


class CampusLogistics(models.Model):
    """
    Paperless Campus Logistics Clearance State Machine for Track 1 In-House interns.
    Manages food (Student Union meal cards) and housing (Dormitory Admin room/key assignments),
    signed digitally by the Department Dean and time-bounded by the cohort schedule.
    """

    class DormStatus(models.TextChoices):
        UNASSIGNED = "UNASSIGNED", "Unassigned"
        ASSIGNED = "ASSIGNED", "Assigned"
        KEY_ISSUED = "KEY_ISSUED", "Key Issued"
        PENDING_KEY_RETURN = "PENDING_KEY_RETURN", "Pending Key Return"
        RETURNED = "RETURNED", "Key Returned"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    student = models.OneToOneField(
        "uil_profiles.UILStudentProfile",
        on_delete=models.CASCADE,
        related_name="campus_logistics",
        verbose_name="UIL Student Profile",
        help_text="The Track 1 student intern receiving campus food and housing clearance.",
    )

    cohort = models.ForeignKey(
        "teams.InHouseCohort",
        on_delete=models.CASCADE,
        related_name="logistics_records",
        verbose_name="In-House Cohort",
        help_text="The associated in-house software house cohort.",
    )

    # Step 1: UIL Officer Placement
    uil_placed = models.BooleanField(
        default=True,
        db_index=True,
        verbose_name="UIL Placed",
        help_text="Whether UIL Officer marked student as placed for Track 1 campus logistics.",
    )
    uil_placed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uil_placed_logistics",
        verbose_name="UIL Placed By",
    )
    uil_placed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="UIL Placed At",
    )

    # Step 2: Department Dean Cryptographic Digital Sign-Off
    dean_approved = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Dean Approved",
        help_text="Whether the Department Dean has approved campus logistics clearance.",
    )

    dean_signature_hash = models.CharField(
        max_length=128,
        blank=True,
        default="",
        verbose_name="Dean Signature Hash",
        help_text="Cryptographic HMAC-SHA256 digital signature generated upon Dean sign-off.",
    )

    dean_signed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dean_signed_logistics",
        verbose_name="Dean Signed By",
    )

    dean_signed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Dean Signed At",
    )

    # Step 3: Student Union Meal Card
    meal_card_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        verbose_name="Meal Card Number",
        help_text="Unique student meal card identifier issued by Student Union.",
    )

    meal_card_active = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Meal Card Active",
        help_text="Whether the student's campus dining hall access is currently active.",
    )

    meal_card_issued_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Meal Card Issued At",
    )

    meal_card_issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meal_cards_issued",
        verbose_name="Meal Card Issued By",
    )

    meal_card_appointment = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Meal Card Pickup Appointment",
        help_text="Scheduled pickup appointment for the student's physical meal card.",
    )

    student_union_signature_hash = models.CharField(
        max_length=128,
        blank=True,
        default="",
        verbose_name="Student Union HMAC Hash",
    )

    student_union_qr_code = models.TextField(
        blank=True,
        default="",
        verbose_name="Student Union Meal Confirmation Base64 QR",
    )

    # Step 4: Dormitory Admin Room & Key Assignment (6-8 beds per room)
    dorm_block = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="Dormitory Block",
        help_text="Assigned residential building or block (e.g. 'Block B').",
    )

    dorm_room = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="Dormitory Room",
        help_text="Assigned dormitory room number (e.g. '204').",
    )

    dorm_bed_number = models.CharField(
        max_length=20,
        blank=True,
        default="",
        verbose_name="Dormitory Bed Number",
        help_text="Assigned bed within room (e.g. 'Bed 1' through 'Bed 8').",
    )

    dorm_status = models.CharField(
        max_length=50,
        choices=DormStatus.choices,
        default=DormStatus.UNASSIGNED,
        db_index=True,
        verbose_name="Dormitory Status",
    )

    key_issued = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Key Issued",
        help_text="Whether the dormitory physical room key has been handed to the student.",
    )

    key_issued_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Key Issued At",
    )

    key_issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dorm_keys_issued",
        verbose_name="Key Issued By",
    )

    # Validity Period & Exit Clearance
    valid_from = models.DateField(
        null=True,
        blank=True,
        verbose_name="Valid From",
    )

    valid_until = models.DateField(
        null=True,
        blank=True,
        verbose_name="Valid Until",
    )

    cleared_at_exit = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Cleared At Exit",
        help_text="Final clearance confirmed upon internship completion and key return.",
    )

    room_checkout = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Room Checkout Checkbox",
        help_text="Checkout checkbox marked upon student exit or deadline.",
    )

    room_checkout_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Room Checkout Timestamp",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Campus Logistics Clearance"
        verbose_name_plural = "Campus Logistics Clearances"
        ordering = ["-created_at"]

    @property
    def user(self):
        if hasattr(self.student, "user") and self.student.user:
            return self.student.user
        if hasattr(self.student, "student") and hasattr(self.student.student, "user"):
            return self.student.student.user
        return None

    def __str__(self):
        student_id = getattr(self.student, "student_id_number", "Unknown")
        email = getattr(self.user, "email", "No Email")
        return f"Logistics for {student_id} ({email}) - Dean Approved: {self.dean_approved}"

    def sign_dean_clearance(self, dean_user):
        """
        Executes Step 2: Department Dean cryptographic digital sign-off.
        Enforces prerequisite: student must have been placed by UIL Officer.
        """
        if not self.uil_placed:
            raise ValidationError("Cannot sign clearance before student is placed by UIL Officer.")
        self.dean_approved = True
        self.dean_signed_by = dean_user
        self.dean_signed_at = timezone.now()
        timestamp_str = self.dean_signed_at.isoformat()
        self.dean_signature_hash = generate_dean_signature(
            student_id_number=str(self.student.student_id_number),
            cohort_id=str(self.cohort.id),
            dean_user_id=str(dean_user.id),
            timestamp_str=timestamp_str,
        )
        self.save()

    def verify_dean_signature(self) -> bool:
        """
        Cryptographically validates the stored HMAC-SHA256 signature hash.
        """
        if not self.dean_approved or not self.dean_signature_hash or not self.dean_signed_at or not self.dean_signed_by:
            return False
        expected_hash = generate_dean_signature(
            student_id_number=str(self.student.student_id_number),
            cohort_id=str(self.cohort.id),
            dean_user_id=str(self.dean_signed_by.id),
            timestamp_str=self.dean_signed_at.isoformat(),
        )
        return hmac.compare_digest(self.dean_signature_hash, expected_hash)

    def activate_meal_card(self, card_number: str, issued_by_user):
        """
        Executes Step 3: Student Union enters meal card number and activates dining access.
        Enforces prerequisite: dean_approved must be True.
        """
        if not self.dean_approved:
            raise ValidationError("Cannot activate meal card without Department Dean approval.")
        self.meal_card_number = card_number
        self.meal_card_active = True
        self.meal_card_issued_at = timezone.now()
        self.meal_card_issued_by = issued_by_user
        self.save()

    def assign_dorm_and_key(self, block: str, room: str, bed: str, issued_by_user, issue_key: bool = True):
        """
        Executes Step 4: Dormitory Admin assigns room/bed (6-8 beds per room) and issues key.
        Enforces prerequisite: dean_approved must be True AND meal_card_active must be True.
        """
        if not self.dean_approved:
            raise ValidationError("Cannot assign dormitory room or issue keys without Department Dean approval.")
        if not self.meal_card_active or not self.meal_card_number:
            raise ValidationError("Cannot assign dormitory room or issue keys before Student Union has issued and activated the student's meal card.")
        self.dorm_block = block
        self.dorm_room = room
        self.dorm_bed_number = bed
        if issue_key:
            self.key_issued = True
            self.key_issued_at = timezone.now()
            self.key_issued_by = issued_by_user
            self.dorm_status = self.DormStatus.KEY_ISSUED
        else:
            self.dorm_status = self.DormStatus.ASSIGNED
        self.save()

    def return_dorm_key(self):
        """
        Student returns key at the conclusion of on-campus placement.
        """
        self.key_issued = False
        self.dorm_status = self.DormStatus.RETURNED
        self.cleared_at_exit = True
        self.save()

    @property
    def is_valid_today(self) -> bool:
        if not self.valid_until:
            return True
        return timezone.now().date() <= self.valid_until
