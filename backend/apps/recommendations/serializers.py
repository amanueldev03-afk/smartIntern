from rest_framework import serializers

from .models import Recommendation


class RecommendationSerializer(serializers.ModelSerializer):
    """
    Serializer for recommendation history with full score breakdown.
    """

    internship_title = serializers.CharField(
        source="internship.title",
        read_only=True,
    )

    organization_name = serializers.CharField(
        source="internship.organization_name",
        read_only=True,
    )

    student_email = serializers.EmailField(
        source="student.email",
        read_only=True,
    )

    class Meta:
        model = Recommendation

        fields = [
            "id",
            "student",
            "student_email",
            "internship",
            "internship_title",
            "organization_name",
            "overall_score",
            "semantic_score",
            "skill_score",
            "preference_score",
            "location_score",
            "salary_score",
            "education_score",
            "interest_score",
            "experience_score",
            "status",
            "recommendation_date",
            "viewed_at",
            "saved_at",
            "applied_at",
            "ignored_at",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "student_email",
            "internship_title",
            "organization_name",
            "recommendation_date",
            "viewed_at",
            "saved_at",
            "applied_at",
            "ignored_at",
            "created_at",
            "updated_at",
        ]


class RecommendationFeedbackSerializer(serializers.Serializer):
    """
    Serializer for updating recommendation feedback status.
    """

    action = serializers.ChoiceField(
        choices=[
            "view",
            "save",
            "apply",
            "ignore",
        ]
    )
