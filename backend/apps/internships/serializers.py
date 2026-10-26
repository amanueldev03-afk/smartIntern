from rest_framework import serializers
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field, OpenApiTypes

from .models import (
    Internship,
    InternshipSource,
    InternshipCollectionLog,
    InternshipDuplicateFlag,
    SavedInternship,
    InternshipApplication,
    Skill,
)
from .validators import validate_internship_is_available


class InternshipSourceSerializer(serializers.ModelSerializer):
    """
    Serializer for internship sources.
    """

    class Meta:
        model = InternshipSource

        fields = [
            "id",
            "name",
            "source_type",
            "website_url",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]


class InternshipSerializer(serializers.ModelSerializer):
    """
    Serializer for internship opportunities.
    """

    source_name = serializers.CharField(
        source="source.name",
        read_only=True,
        help_text="Name of the internship source"
    )

    external_id = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="External identifier from source"
    )

    is_expired = serializers.SerializerMethodField(
        help_text="Whether the internship application deadline has passed"
    )

    is_flagged = serializers.SerializerMethodField(
        help_text="Whether the internship has been flagged for admin review or broken links"
    )

    class Meta:
        model = Internship

        fields = [
            "id",

            # Basic information
            "title",
            "organization_name",
            "description",
            "category",

            # Location
            "country",
            "city",
            "location_text",
            "internship_type",

            # Work
            "work_type",

            # Compensation
            "compensation_type",
            "minimum_compensation",
            "maximum_compensation",
            "compensation_currency",
            "compensation_period",

            # Skills
            "required_skills",
            "preferred_skills",

            # Duration
            "duration_min_weeks",
            "duration_max_weeks",

            # Application/source
            "application_url",
            "source",
            "source_name",
            "source_url",
            "external_id",

            # Dates
            "posted_at",
            "application_deadline",

            # Status
            "is_verified",
            "is_expired",
            "is_flagged",
            "is_published",
            "published_at",
            "url_validation",
            "status",
            "embedding_status",
            "embedding_error",

            # Timestamps
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "source_name",
            "is_flagged",
            "url_validation",
            "embedding_status",
            "embedding_error",
            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            "external_id": {"required": False, "allow_blank": True},
            "source_url": {"required": False, "allow_blank": True},
            "category": {"required": False, "allow_blank": True},
            "country": {"required": False, "allow_blank": True},
            "city": {"required": False, "allow_blank": True},
            "location_text": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        """
        Validate internship data.
        """

        compensation_type = attrs.get(
            "compensation_type",
            getattr(
                self.instance,
                "compensation_type",
                "unknown",
            ),
        )

        minimum_compensation = attrs.get(
            "minimum_compensation",
            getattr(
                self.instance,
                "minimum_compensation",
                None,
            ),
        )

        maximum_compensation = attrs.get(
            "maximum_compensation",
            getattr(
                self.instance,
                "maximum_compensation",
                None,
            ),
        )

        if compensation_type == "paid":

            if minimum_compensation is None:
                raise serializers.ValidationError(
                    {
                        "minimum_compensation": (
                            "Minimum compensation is required "
                            "for paid internships."
                        )
                    }
                )

            if maximum_compensation is None:
                raise serializers.ValidationError(
                    {
                        "maximum_compensation": (
                            "Maximum compensation is required "
                            "for paid internships."
                        )
                    }
                )

            if minimum_compensation > maximum_compensation:
                raise serializers.ValidationError(
                    {
                        "maximum_compensation": (
                            "Maximum compensation must be greater "
                            "than or equal to minimum compensation."
                        )
                    }
                )

        min_duration = attrs.get(
            "duration_min_weeks",
            getattr(
                self.instance,
                "duration_min_weeks",
                None,
            ),
        )

        max_duration = attrs.get(
            "duration_max_weeks",
            getattr(
                self.instance,
                "duration_max_weeks",
                None,
            ),
        )

        if (
            min_duration is not None
            and max_duration is not None
            and min_duration > max_duration
        ):
            raise serializers.ValidationError(
                {
                    "duration_max_weeks": (
                        "Maximum duration must be greater "
                        "than or equal to minimum duration."
                    )
                }
            )

        return attrs

    @extend_schema_field(serializers.BooleanField())
    def get_is_expired(self, obj):
        """
        Return whether the internship deadline has passed.
        """

        return obj.is_expired()

    @extend_schema_field(serializers.BooleanField())
    def get_is_flagged(self, obj):
        """
        Return whether the internship is flagged / needs review.
        """

        return getattr(obj, "needs_review", False)


class InternshipCollectionLogSerializer(
    serializers.ModelSerializer
):
    """
    Serializer for collection logs.
    """

    source_name = serializers.CharField(
        source="source.name",
        read_only=True,
    )

    class Meta:
        model = InternshipCollectionLog

        fields = [
            "id",
            "source",
            "source_name",
            "status",
            "started_at",
            "completed_at",
            "records_found",
            "records_created",
            "records_updated",
            "records_failed",
            "error_message",
        ]

        read_only_fields = [
            "id",
            "source_name",
            "status",
            "started_at",
            "completed_at",
            "records_found",
            "records_created",
            "records_updated",
            "records_failed",
            "error_message",
        ]


class SavedInternshipSerializer(
    serializers.ModelSerializer
):
    """
    Serializer for a student's saved internship.
    """

    internship_title = serializers.CharField(
        source="internship.title",
        read_only=True,
    )

    organization_name = serializers.CharField(
        source="internship.organization_name",
        read_only=True,
    )

    application_url = serializers.URLField(
        source="internship.application_url",
        read_only=True,
    )

    source_url = serializers.URLField(
        source="internship.source_url",
        read_only=True,
    )

    internship_details = serializers.SerializerMethodField(
        read_only=True,
    )

    class Meta:
        model = SavedInternship

        fields = [
            "id",
            "internship",
            "internship_title",
            "organization_name",
            "application_url",
            "source_url",
            "internship_details",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "internship_title",
            "organization_name",
            "application_url",
            "source_url",
            "internship_details",
            "created_at",
        ]

    def get_internship_details(self, obj):
        if obj.internship:
            return InternshipSerializer(obj.internship).data
        return None

    def validate_internship(self, internship):
        validate_internship_is_available(internship)
        return internship


class InternshipApplicationSerializer(
    serializers.ModelSerializer
):
    """
    Serializer for student internship applications.
    """

    internship_title = serializers.CharField(
        source="internship.title",
        read_only=True,
    )

    organization_name = serializers.CharField(
        source="internship.organization_name",
        read_only=True,
    )

    application_url = serializers.URLField(
        source="internship.application_url",
        read_only=True,
    )

    class Meta:
        model = InternshipApplication

        fields = [
            "id",
            "internship",
            "internship_title",
            "organization_name",
            "application_url",
            "status",
            "created_at",
            "updated_at",
            "notes",
        ]

        read_only_fields = [
            "id",
            "internship_title",
            "organization_name",
            "application_url",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        internship = attrs.get("internship")
        if internship is not None:
            validate_internship_is_available(internship)
        return attrs


class InternshipVerificationSerializer(
    serializers.Serializer
):
    """
    Serializer used by Admin to verify or reject
    an internship.
    """

    action = serializers.ChoiceField(
        choices=[
            "verify",
            "reject",
        ]
    )

    rejection_reason = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    def validate(self, attrs):

        action = attrs["action"]
        reason = attrs.get(
            "rejection_reason",
            "",
        ).strip()

        if action == "reject" and not reason:
            raise serializers.ValidationError(
                {
                    "rejection_reason": (
                        "A rejection reason is required."
                    )
                }
            )

        return attrs


class AdminInternshipSerializer(
    serializers.ModelSerializer
):
    verified_by_email = serializers.EmailField(
        source="verified_by.email",
        read_only=True,
    )

    class Meta:
        model = Internship

        fields = [
            "id",
            "title",
            "description",
            "organization_name",
            "application_url",
            "status",
            "verified_at",
            "verified_by",
            "verified_by_email",
            "rejection_reason",
            "embedding_status",
            "embedding_error",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "verified_at",
            "verified_by",
            "verified_by_email",
            "embedding_status",
            "embedding_error",
            "created_at",
            "updated_at",
        ]

    def validate_application_deadline(self, value):

        if value is not None and value <= timezone.now():
            raise serializers.ValidationError(
                "Application deadline must be in the future."
            )

        return value


class StudentDashboardSerializer(
    serializers.Serializer
):
    saved_internships = serializers.IntegerField()

    total_applications = serializers.IntegerField()

    applied_applications = serializers.IntegerField()

    interview_applications = serializers.IntegerField()

    accepted_applications = serializers.IntegerField()

    rejected_applications = serializers.IntegerField()

    withdrawn_applications = serializers.IntegerField()

    recent_applications = (
        InternshipApplicationSerializer(
            many=True
        )
    )

    recent_saved_internships = (
        SavedInternshipSerializer(
            many=True
        )
    )


class AdminRecentInternshipSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Internship

        fields = [
            "id",
            "title",
            "organization_name",
            "status",
            "application_deadline",
            "created_at",
        ]


class AdminCollectionLogSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = InternshipCollectionLog

        fields = [
            "id",
            "status",
            "started_at",
            "completed_at",
            "created_count",
            "updated_count",
            "error_message",
        ]


class AdminDashboardSerializer(serializers.Serializer):
    """
    Platform-wide statistics for Admin.
    """

    total_students = serializers.IntegerField()

    total_internships = serializers.IntegerField()

    draft_internships = serializers.IntegerField()

    active_internships = serializers.IntegerField()

    rejected_internships = serializers.IntegerField()

    expired_internships = serializers.IntegerField()

    total_applications = serializers.IntegerField()

    applied_applications = serializers.IntegerField()

    interview_applications = serializers.IntegerField()

    accepted_applications = serializers.IntegerField()

    rejected_applications = serializers.IntegerField()

    withdrawn_applications = serializers.IntegerField()

    total_collection_logs = serializers.IntegerField()

    successful_collections = serializers.IntegerField()

    failed_collections = serializers.IntegerField()

    pending_verification = serializers.IntegerField()

    recent_internships = (
        AdminRecentInternshipSerializer(
            many=True
        )
    )


class SkillSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Skill

        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]


class AdminInternshipDuplicateFlagSerializer(
    serializers.ModelSerializer
):
    """
    Read-only serializer for duplicate flags attached to an internship.
    """

    class Meta:
        model = InternshipDuplicateFlag
        fields = [
            "id",
            "title",
            "organization_name",
            "application_url",
            "similarity_score",
            "review_status",
            "last_seen_at",
            "created_at",
        ]
        read_only_fields = fields


class AdminInternshipReviewSerializer(
    serializers.ModelSerializer
):
    """
    Read-only serializer for the admin internship review queue.

    Exposes internship details together with ``needs_review``, review
    reasons (url_validation, skills_review), and any pending near-duplicate
    flags so administrators can make informed approve / reject / remove
    decisions.
    """

    source_name = serializers.CharField(
        source="source.name",
        read_only=True,
        default=None,
    )
    data_source_name = serializers.CharField(
        source="data_source.name",
        read_only=True,
        default=None,
    )
    duplicate_flags = AdminInternshipDuplicateFlagSerializer(
        many=True,
        read_only=True,
    )
    pending_duplicate_count = serializers.SerializerMethodField()
    invalid_urls = serializers.SerializerMethodField()
    low_confidence_skills = serializers.SerializerMethodField()

    class Meta:
        model = Internship
        fields = [
            "id",
            "title",
            "organization_name",
            "application_url",
            "source_url",
            "country",
            "city",
            "location_text",
            "internship_type",
            "status",
            "is_verified",
            "needs_review",
            "url_validation",
            "validated_at",
            "skills_review",
            "invalid_urls",
            "low_confidence_skills",
            "duplicate_flags",
            "pending_duplicate_count",
            "source_name",
            "source",
            "data_source_name",
            "data_source",
            "rejection_reason",
            "verified_at",
            "created_at",
            "updated_at",
            "last_seen_at",
        ]
        read_only_fields = fields

    def get_pending_duplicate_count(self, obj):
        return obj.duplicate_flags.filter(
            review_status=InternshipDuplicateFlag.REVIEW_PENDING,
        ).count()

    def get_invalid_urls(self, obj):
        checks = obj.url_validation or {}
        return [
            url for url, info in checks.items()
            if isinstance(info, dict) and not info.get("valid", True)
        ]

    def get_low_confidence_skills(self, obj):
        return [
            entry for entry in (obj.skills_review or [])
            if isinstance(entry, dict) and entry.get("low_confidence")
        ]


class DataSourceHealthSerializer(serializers.Serializer):
    """
    Read-only serializer for data-source health monitoring.

    Aggregates the most recent ``InternshipCollectionLog`` for each
    ``InternshipSource`` and surfaces last-sync status, errors, and
    timestamps.
    """

    id = serializers.IntegerField()
    name = serializers.CharField()
    source_type = serializers.CharField()
    is_active = serializers.BooleanField()
    website_url = serializers.URLField(
        required=False, allow_blank=True, default="",
    )
    last_synced_at = serializers.DateTimeField(
        allow_null=True, required=False,
    )
    last_run_status = serializers.CharField(
        allow_null=True, required=False, default=None,
    )
    last_run_started_at = serializers.DateTimeField(
        allow_null=True, required=False, default=None,
    )
    last_run_completed_at = serializers.DateTimeField(
        allow_null=True, required=False, default=None,
    )
    last_error = serializers.CharField(
        allow_null=True, required=False, default=None,
    )
    last_records_found = serializers.IntegerField(
        required=False, default=0,
    )
    last_records_created = serializers.IntegerField(
        required=False, default=0,
    )
    last_records_failed = serializers.IntegerField(
        required=False, default=0,
    )
    total_runs = serializers.IntegerField(
        required=False, default=0,
    )
