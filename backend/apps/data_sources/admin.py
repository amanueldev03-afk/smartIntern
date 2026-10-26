from django.contrib import admin
from .models import DataSource


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "type",
        "base_url",
        "is_active",
        "last_synced_at",
        "created_at",
    )
    list_filter = (
        "type",
        "is_active",
    )
    search_fields = (
        "name",
        "base_url",
        "description",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )

