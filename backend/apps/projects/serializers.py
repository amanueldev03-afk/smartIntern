from rest_framework import serializers
from .models import WeeklyLogbook, LogbookAlert, ProjectTeam, TeamMember, ProjectTeamMessage


class TeamMemberSerializer(serializers.ModelSerializer):
    student_id = serializers.CharField(source="student.student_id_number", read_only=True)
    student_name = serializers.SerializerMethodField(read_only=True)
    student_email = serializers.EmailField(source="student.user.email", read_only=True)
    skill_tags = serializers.JSONField(source="student.skill_tags", read_only=True)

    class Meta:
        model = TeamMember
        fields = [
            "id",
            "student",
            "student_id",
            "student_name",
            "student_email",
            "skill_tags",
            "is_leader",
            "assigned_role",
            "created_at",
        ]

    def get_student_name(self, obj) -> str:
        if obj.student and obj.student.user:
            return getattr(obj.student.user, "full_name", "") or obj.student.user.email
        return ""


class ProjectTeamSerializer(serializers.ModelSerializer):
    members = TeamMemberSerializer(many=True, read_only=True)
    cohort_name = serializers.CharField(source="cohort.university_name", read_only=True)
    advisor_name = serializers.SerializerMethodField(read_only=True)
    is_coding_unlocked = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProjectTeam
        fields = [
            "id",
            "cohort",
            "cohort_name",
            "team_name",
            "project_title",
            "assigned_advisor",
            "advisor_name",
            "srs_document",
            "srs_status",
            "srs_feedback",
            "srs_revision_deadline",
            "channels_active",
            "is_coding_unlocked",
            "members",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "srs_status",
            "srs_feedback",
            "srs_revision_deadline",
            "is_coding_unlocked",
            "created_at",
            "updated_at",
        ]

    def get_advisor_name(self, obj) -> str:
        if obj.assigned_advisor:
            return getattr(obj.assigned_advisor, "full_name", "") or obj.assigned_advisor.email
        return ""


class SRSDocumentUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTeam
        fields = ["srs_document"]

    def validate_srs_document(self, value):
        if not value:
            raise serializers.ValidationError("An SRS document file is required.")
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("SRS document must be a PDF file.")
        if value.size > 25 * 1024 * 1024:  # 25 MB
            raise serializers.ValidationError("SRS document file size cannot exceed 25MB.")
        return value


class SRSAdvisorReviewSerializer(serializers.Serializer):
    srs_status = serializers.ChoiceField(
        choices=[ProjectTeam.SRSStatus.APPROVED, ProjectTeam.SRSStatus.REJECTED]
    )
    srs_feedback = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )


class WeeklyLogbookSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField(read_only=True)
    student_email = serializers.EmailField(source="student.email", read_only=True)
    academic_advisor_name = serializers.SerializerMethodField(read_only=True)
    company_mentor_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WeeklyLogbook
        fields = [
            "id",
            "project_team",
            "student",
            "student_name",
            "student_email",
            "academic_advisor",
            "academic_advisor_name",
            "company_mentor",
            "company_mentor_name",
            "week_number",
            "tasks_planned",
            "tasks_executed",
            "challenges_faced",
            "git_commit_urls",
            "similarity_score",
            "is_flagged",
            "matched_snippet",
            "advisor_approved",
            "advisor_feedback",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "student",
            "similarity_score",
            "is_flagged",
            "matched_snippet",
            "advisor_approved",
            "advisor_feedback",
            "submitted_at",
            "created_at",
            "updated_at",
        ]

    def get_student_name(self, obj) -> str:
        if obj.student:
            return getattr(obj.student, "full_name", "") or getattr(obj.student, "email", "")
        return ""

    def get_academic_advisor_name(self, obj) -> str:
        if obj.academic_advisor:
            return getattr(obj.academic_advisor, "full_name", "") or getattr(obj.academic_advisor, "email", "")
        return ""

    def get_company_mentor_name(self, obj) -> str:
        if obj.company_mentor:
            return getattr(obj.company_mentor, "full_name", "") or getattr(obj.company_mentor, "email", "")
        return ""

    def validate_week_number(self, value):
        if value < 1 or value > 52:
            raise serializers.ValidationError("Week number must be between 1 and 52.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["student"] = user
        return super().create(validated_data)


class WeeklyLogbookApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyLogbook
        fields = ["advisor_approved", "advisor_feedback"]

    def validate_advisor_approved(self, value):
        if not isinstance(value, bool):
            raise serializers.ValidationError("advisor_approved must be a boolean.")
        return value


class LogbookAlertSerializer(serializers.ModelSerializer):
    logbook_id = serializers.UUIDField(source="logbook.id", read_only=True)
    week_number = serializers.IntegerField(source="logbook.week_number", read_only=True)

    class Meta:
        model = LogbookAlert
        fields = [
            "id",
            "logbook_id",
            "week_number",
            "alert_type",
            "title",
            "message",
            "is_read",
            "metadata",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "logbook_id",
            "alert_type",
            "title",
            "message",
            "metadata",
            "created_at",
        ]


class InHouseCohortSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField(read_only=True)
    teams_count = serializers.SerializerMethodField(read_only=True)
    invited_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        from apps.teams.models import InHouseCohort
        model = InHouseCohort
        fields = [
            "id",
            "title",
            "department",
            "requirements",
            "opportunities",
            "min_gpa",
            "university_name",
            "academic_year",
            "start_date",
            "end_date",
            "capacity_k",
            "enrolled_count",
            "is_open",
            "student_count",
            "invited_count",
            "teams_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "enrolled_count", "created_at", "updated_at"]

    def get_student_count(self, obj) -> int:
        return obj.accepted_students.count()

    def get_invited_count(self, obj) -> int:
        return obj.invited_students.count()

    def get_teams_count(self, obj) -> int:
        return obj.teams.count()


class ProjectTeamMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField(read_only=True)
    sender_role = serializers.SerializerMethodField(read_only=True)
    sender_email = serializers.EmailField(source="sender.email", read_only=True)

    class Meta:
        model = ProjectTeamMessage
        fields = [
            "id",
            "team",
            "sender",
            "sender_name",
            "sender_role",
            "sender_email",
            "message",
            "message_type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "sender", "sender_name", "sender_role", "sender_email", "created_at", "updated_at"]

    def get_sender_name(self, obj) -> str:
        if obj.sender:
            return getattr(obj.sender, "full_name", "") or obj.sender.email
        return "Unknown"

    def get_sender_role(self, obj) -> str:
        if obj.sender:
            return str(getattr(obj.sender, "role", "student")).lower()
        return "student"

