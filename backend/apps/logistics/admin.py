from django.contrib import admin
from .models import CampusLogistics


@admin.register(CampusLogistics)
class CampusLogisticsAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "cohort",
        "dean_approved",
        "meal_card_number",
        "meal_card_active",
        "dorm_block",
        "dorm_room",
        "dorm_bed_number",
        "dorm_status",
        "key_issued",
        "valid_until",
        "cleared_at_exit",
    )
    list_filter = (
        "dean_approved",
        "meal_card_active",
        "key_issued",
        "dorm_status",
        "cleared_at_exit",
        "cohort",
    )
    search_fields = (
        "student__student_id_number",
        "student__user__email",
        "meal_card_number",
        "dorm_room",
    )
    readonly_fields = ("dean_signature_hash", "dean_signed_at", "created_at", "updated_at")
