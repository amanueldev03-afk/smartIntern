from rest_framework import serializers
from .models import CampusLogistics
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import InHouseCohort


class CampusLogisticsSerializer(serializers.ModelSerializer):
    student_id_number = serializers.CharField(source="student.student_id_number", read_only=True)
    student_name = serializers.SerializerMethodField(read_only=True)
    student_email = serializers.SerializerMethodField(read_only=True)
    department = serializers.CharField(source="student.department", read_only=True)
    academic_year = serializers.IntegerField(source="student.academic_year", read_only=True)
    cohort_name = serializers.CharField(source="cohort.university_name", read_only=True)
    cohort_academic_year = serializers.CharField(source="cohort.academic_year", read_only=True)
    uil_placed_by_name = serializers.SerializerMethodField(read_only=True)
    dean_signed_by_name = serializers.SerializerMethodField(read_only=True)
    meal_card_issued_by_name = serializers.SerializerMethodField(read_only=True)
    key_issued_by_name = serializers.SerializerMethodField(read_only=True)
    signature_verified = serializers.SerializerMethodField(read_only=True)
    is_valid_today = serializers.BooleanField(read_only=True)

    class Meta:
        model = CampusLogistics
        fields = [
            "id",
            "student",
            "student_id_number",
            "student_name",
            "student_email",
            "department",
            "academic_year",
            "cohort",
            "cohort_name",
            "cohort_academic_year",
            "uil_placed",
            "uil_placed_by",
            "uil_placed_by_name",
            "uil_placed_at",
            "dean_approved",
            "dean_signature_hash",
            "dean_signed_by",
            "dean_signed_by_name",
            "dean_signed_at",
            "signature_verified",
            "meal_card_number",
            "meal_card_active",
            "meal_card_issued_at",
            "meal_card_issued_by",
            "meal_card_issued_by_name",
            "meal_card_appointment",
            "student_union_signature_hash",
            "student_union_qr_code",
            "dorm_block",
            "dorm_room",
            "dorm_bed_number",
            "dorm_status",
            "key_issued",
            "key_issued_at",
            "key_issued_by",
            "key_issued_by_name",
            "room_checkout",
            "room_checkout_at",
            "valid_from",
            "valid_until",
            "is_valid_today",
            "cleared_at_exit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "dean_approved",
            "dean_signature_hash",
            "dean_signed_by",
            "dean_signed_at",
            "signature_verified",
            "meal_card_active",
            "meal_card_issued_at",
            "meal_card_issued_by",
            "dorm_status",
            "key_issued",
            "key_issued_at",
            "key_issued_by",
            "created_at",
            "updated_at",
        ]

    def get_student_name(self, obj) -> str:
        user = getattr(obj, "user", None) or getattr(obj.student, "user", None)
        if user:
            return getattr(user, "full_name", "") or user.get_full_name() or user.email
        return getattr(obj.student, "student_id_number", "")

    def get_student_email(self, obj) -> str:
        user = getattr(obj, "user", None) or getattr(obj.student, "user", None)
        return getattr(user, "email", "") if user else ""

    def get_uil_placed_by_name(self, obj) -> str:
        if getattr(obj, "uil_placed_by", None):
            return getattr(obj.uil_placed_by, "full_name", "") or obj.uil_placed_by.email
        return ""

    def get_dean_signed_by_name(self, obj) -> str:
        if obj.dean_signed_by:
            return getattr(obj.dean_signed_by, "full_name", "") or obj.dean_signed_by.email
        return ""

    def get_meal_card_issued_by_name(self, obj) -> str:
        if obj.meal_card_issued_by:
            return getattr(obj.meal_card_issued_by, "full_name", "") or obj.meal_card_issued_by.email
        return ""

    def get_key_issued_by_name(self, obj) -> str:
        if obj.key_issued_by:
            return getattr(obj.key_issued_by, "full_name", "") or obj.key_issued_by.email
        return ""

    def get_signature_verified(self, obj) -> bool:
        return obj.verify_dean_signature()


class UILPlacementSerializer(serializers.Serializer):
    student_id = serializers.CharField(
        help_text="StudentProfile UUID or university student_id_number"
    )
    cohort_id = serializers.UUIDField(help_text="InHouseCohort UUID")
    valid_from = serializers.DateField(required=False, allow_null=True)
    valid_until = serializers.DateField(required=False, allow_null=True)


class MealCardActivationSerializer(serializers.Serializer):
    meal_card_number = serializers.CharField(
        max_length=64,
        required=True,
        help_text="Meal card number or RFID barcode string to activate.",
    )


class DormAssignmentSerializer(serializers.Serializer):
    dorm_block = serializers.CharField(max_length=50, required=True)
    dorm_room = serializers.CharField(max_length=50, required=True)
    dorm_bed_number = serializers.CharField(max_length=20, required=True)
    issue_key = serializers.BooleanField(default=True, required=False)
