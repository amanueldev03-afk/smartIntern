from django.contrib import admin
from .models import InHouseCohort


@admin.register(InHouseCohort)
class InHouseCohortAdmin(admin.ModelAdmin):
    list_display = (
        "university_name",
        "academic_year",
        "start_date",
        "end_date",
        "capacity_k",
        "enrolled_count",
        "is_open",
        "created_at",
    )
    list_filter = ("university_name", "academic_year", "is_open")
    search_fields = ("university_name", "academic_year")
