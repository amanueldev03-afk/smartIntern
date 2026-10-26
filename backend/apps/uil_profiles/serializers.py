from decimal import Decimal
import logging
from rest_framework import serializers

from apps.uil_profiles.models import Resume, UILStudentProfile
from ai_engine.parsers.cv_extractor import validate_resume_file

logger = logging.getLogger(__name__)


class ResumeUploadSerializer(serializers.ModelSerializer):
    """
    Serializer for uploading resume documents (PDF, DOCX).
    Enforces max 5MB and MIME validation via python-magic.
    """

    class Meta:
        model = Resume
        fields = ["id", "file", "parsing_status", "uploaded_at"]
        read_only_fields = ["id", "parsing_status", "uploaded_at"]

    def validate_file(self, value):
        try:
            validate_resume_file(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))
        return value


class ResumeStatusSerializer(serializers.ModelSerializer):
    """
    Serializer for querying resume parsing status and extracted structured suggestions.
    """

    class Meta:
        model = Resume
        fields = [
            "id",
            "parsing_status",
            "uploaded_at",
            "updated_at",
            "extracted_text",
            "parsed_data",
            "error_message",
        ]
        read_only_fields = fields


class ResumeFieldConfirmationSerializer(serializers.Serializer):
    """
    Serializer for explicit field-by-field confirmation of extracted resume data.
    The student explicitly selects which suggestions to apply to their profile.
    """

    gpa = serializers.DecimalField(
        max_digits=3,
        decimal_places=2,
        min_value=Decimal("0.0"),
        max_value=Decimal("4.0"),
        required=False,
        allow_null=True,
    )
    github_url = serializers.URLField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    department = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
    )
    university = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
    )
    phone_number = serializers.CharField(
        max_length=30,
        required=False,
        allow_blank=True,
    )
    skills = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        allow_empty=True,
    )
