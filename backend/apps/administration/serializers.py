from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.students.models import StudentProfile

User = get_user_model()


class AdminStudentListSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for admin student listing.

    Exposes enough information for an administrator to identify
    the student and their account status without exposing
    sensitive data like passwords or tokens.
    """

    full_name = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()
    education_level = serializers.SerializerMethodField()
    university = serializers.SerializerMethodField()
    field_of_study = serializers.SerializerMethodField()
    skills_count = serializers.SerializerMethodField()
    total_applications = serializers.SerializerMethodField()
    total_recommendations = serializers.SerializerMethodField()
    last_login = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_active",
            "is_email_verified",
            "profile_photo",
            "profile_photo_url",
            "date_joined",
            "last_login",
            "education_level",
            "university",
            "field_of_study",
            "skills_count",
            "total_applications",
            "total_recommendations",
        )

    def get_full_name(self, obj):
        return " ".join(
            filter(None, [obj.first_name, obj.last_name])
        )

    def get_profile_photo_url(self, obj):
        if obj.profile_photo:
            return obj.profile_photo.url
        return None

    def get_education_level(self, obj):
        try:
            return obj.student_profile.education_level
        except (StudentProfile.DoesNotExist, AttributeError):
            return None

    def get_university(self, obj):
        try:
            return obj.student_profile.university
        except (StudentProfile.DoesNotExist, AttributeError):
            return None

    def get_field_of_study(self, obj):
        try:
            return obj.student_profile.field_of_study
        except (StudentProfile.DoesNotExist, AttributeError):
            return None

    def get_skills_count(self, obj):
        try:
            return obj.student_profile.skills.count()
        except (StudentProfile.DoesNotExist, AttributeError):
            return 0

    def get_total_applications(self, obj):
        return obj.internship_applications.count()

    def get_total_recommendations(self, obj):
        return obj.recommendations.count()

    def get_last_login(self, obj):
        return obj.last_login


class StudentActivitySerializer(serializers.ModelSerializer):
    """
    Read-only serializer for student activity logs.
    """

    action_display = serializers.CharField(
        source="get_action_display",
        read_only=True,
    )

    class Meta:
        model = None  # Set dynamically in __init__
        fields = (
            "id",
            "action",
            "action_display",
            "description",
            "metadata",
            "created_at",
        )


def get_student_activity_serializer():
    """
    Return a serializer class for StudentActivityLog.
    Deferred import to avoid circular dependencies.
    """
    from .models import StudentActivityLog

    class _StudentActivitySerializer(serializers.ModelSerializer):
        action_display = serializers.CharField(
            source="get_action_display",
            read_only=True,
        )

        class Meta:
            model = StudentActivityLog
            fields = (
                "id",
                "action",
                "action_display",
                "description",
                "metadata",
                "created_at",
            )

    return _StudentActivitySerializer


class AdminStudentActionSerializer(serializers.Serializer):
    """
    Serializer for admin student activate/deactivate responses.
    """

    message = serializers.CharField()
    student_id = serializers.CharField()
    is_active = serializers.BooleanField()
