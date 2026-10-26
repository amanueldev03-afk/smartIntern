from rest_framework import serializers
from apps.internships.models import Skill
from apps.postings.models import InternshipPosting


class PostingSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name", "category"]


class InternshipPostingSerializer(serializers.ModelSerializer):
    required_skills = PostingSkillSerializer(many=True, read_only=True)
    organization_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    country = serializers.CharField(default="Ethiopia", read_only=True)
    internship_type = serializers.SerializerMethodField()
    work_type = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    is_verified = serializers.BooleanField(default=True, read_only=True)

    class Meta:
        model = InternshipPosting
        fields = [
            "id",
            "title",
            "track",
            "description",
            "organization_name",
            "company_name",
            "city",
            "country",
            "location",
            "internship_type",
            "work_type",
            "required_skills",
            "capacity",
            "occupied_slots",
            "start_date",
            "end_date",
            "is_active",
            "is_expired",
            "is_verified",
            "created_at",
            "updated_at",
        ]

    def get_organization_name(self, obj: InternshipPosting) -> str:
        if obj.owner_company and obj.owner_company.company:
            return obj.owner_company.company.name
        if obj.owner_department:
            return f"{obj.owner_department.university_name} - {obj.owner_department.department_name}"
        return "UIL Institutional Software House"

    def get_company_name(self, obj: InternshipPosting) -> str:
        return self.get_organization_name(obj)

    def get_location(self, obj: InternshipPosting) -> str:
        return obj.city or "Addis Ababa, Ethiopia"

    def get_internship_type(self, obj: InternshipPosting) -> str:
        if obj.track == InternshipPosting.Track.CAMPUS:
            return "on-site"
        return "hybrid"

    def get_work_type(self, obj: InternshipPosting) -> str:
        return self.get_internship_type(obj)

    def get_is_expired(self, obj: InternshipPosting) -> bool:
        return not obj.is_active or obj.is_full


class PostingRecommendationSerializer(serializers.Serializer):
    """
    Mirrors RecommendationSerializer shape from apps.recommendations.serializers,
    plus required 'track' and 'posting_id' fields.
    """
    internship = InternshipPostingSerializer()
    match_score = serializers.FloatField()
    score_breakdown = serializers.DictField()
    explanation = serializers.ListField(child=serializers.CharField())
    track = serializers.CharField()
    posting_id = serializers.IntegerField()
