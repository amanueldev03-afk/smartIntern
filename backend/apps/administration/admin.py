from django.contrib import admin

from .models import StudentActivityLog


@admin.register(StudentActivityLog)
class StudentActivityLogAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "action",
        "description",
        "created_at",
    )
    list_filter = ("action", "created_at")
    search_fields = ("student__email", "description")
    readonly_fields = ("created_at", "updated_at")
