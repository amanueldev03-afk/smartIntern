from django.contrib import admin

from .models import Recommendation


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = [
        "student",
        "internship",
        "overall_score",
        "status",
        "recommendation_date",
    ]

    list_filter = [
        "status",
        "recommendation_date",
    ]

    search_fields = [
        "student__email",
        "internship__title",
        "internship__organization_name",
    ]

    readonly_fields = [
        "student",
        "internship",
        "overall_score",
        "semantic_score",
        "skill_score",
        "preference_score",
        "salary_score",
        "education_score",
        "interest_score",
        "experience_score",
        "location_score",
        "recommendation_date",
        "viewed_at",
        "saved_at",
        "applied_at",
        "ignored_at",
        "created_at",
        "updated_at",
    ]

    ordering = ["-recommendation_date"]

    fieldsets = [
        (
            "Core Information",
            {
                "fields": [
                    "student",
                    "internship",
                    "status",
                ]
            },
        ),
        (
            "Score Breakdown",
            {
                "fields": [
                    "overall_score",
                    "semantic_score",
                    "skill_score",
                    "preference_score",
                    "location_score",
                    "salary_score",
                    "education_score",
                    "interest_score",
                    "experience_score",
                ]
            },
        ),
        (
            "Feedback Timeline",
            {
                "fields": [
                    "recommendation_date",
                    "viewed_at",
                    "saved_at",
                    "applied_at",
                    "ignored_at",
                ]
            },
        ),
        (
            "System",
            {
                "fields": [
                    "created_at",
                    "updated_at",
                ]
            },
        ),
    ]
