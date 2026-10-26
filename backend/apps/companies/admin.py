from django.contrib import admin
from .models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "country",
        "industry",
        "website",
        "created_at",
    )
    list_filter = (
        "country",
        "industry",
    )
    search_fields = (
        "name",
        "industry",
        "country",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )

