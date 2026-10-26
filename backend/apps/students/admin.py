from django.contrib import admin
from .models import (
    Student,
    StudentProfile,
    StudentCV,
    CV,
    CareerInterest,
    StudentSkill,
    StudentInterest,
)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "university",
        "field_of_study",
        "education_level",
        "current_year",
        "work_mode",
        "internship_type",
        "created_at",
    )
    list_filter = (
        "education_level",
        "work_mode",
        "internship_type",
        "experience_level",
    )
    search_fields = (
        "user__email",
        "university",
        "field_of_study",
        "preferred_country",
        "preferred_city",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "university",
        "field_of_study",
        "education_level",
        "created_at",
    )
    search_fields = (
        "user__email",
        "university",
        "field_of_study",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(CV)
class CVAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "processing_status",
        "created_at",
    )
    list_filter = (
        "processing_status",
    )
    search_fields = (
        "student__email",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(CareerInterest)
class CareerInterestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "is_active",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "is_active",
    )
    search_fields = (
        "name",
        "description",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(StudentSkill)
class StudentSkillAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "skill",
        "proficiency",
        "created_at",
    )
    list_filter = (
        "proficiency",
        "skill__category",
    )
    search_fields = (
        "student__user__email",
        "skill__name",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


@admin.register(StudentInterest)
class StudentInterestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "interest",
        "created_at",
    )
    search_fields = (
        "student__user__email",
        "interest__name",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )


