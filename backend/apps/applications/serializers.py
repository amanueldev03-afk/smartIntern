from rest_framework import serializers

from .models import ApplicationHistory


class ApplicationHistorySerializer(serializers.ModelSerializer):
    internship_title = serializers.CharField(
        source="internship.title",
        read_only=True,
    )
    organization_name = serializers.CharField(
        source="internship.organization_name",
        read_only=True,
    )

    class Meta:
        model = ApplicationHistory
        fields = [
            "id",
            "internship",
            "internship_title",
            "organization_name",
            "clicked_apply",
            "applied_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
