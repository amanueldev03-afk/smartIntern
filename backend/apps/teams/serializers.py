from rest_framework import serializers
from apps.teams.models import InHouseCohort, ProjectTeam, TeamMember, WeeklyLogbook


class InHouseCohortSerializer(serializers.ModelSerializer):
    invited_count = serializers.SerializerMethodField(read_only=True)
    accepted_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
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
            "invited_count",
            "accepted_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "enrolled_count", "created_at", "updated_at"]

    def get_invited_count(self, obj) -> int:
        return obj.invited_students.count()

    def get_accepted_count(self, obj) -> int:
        return obj.accepted_students.count()


class TeamMemberSerializer(serializers.ModelSerializer):
    student_id_number = serializers.CharField(source="student.student_id_number", read_only=True)
    student_email = serializers.CharField(source="student.student.user.email", read_only=True)

    class Meta:
        model = TeamMember
        fields = [
            "id",
            "student",
            "student_id_number",
            "student_email",
            "is_leader",
            "role",
            "created_at",
        ]


class ProjectTeamSerializer(serializers.ModelSerializer):
    members = TeamMemberSerializer(many=True, read_only=True)
    assigned_advisor_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectTeam
        fields = [
            "id",
            "cohort",
            "team_name",
            "project_title",
            "assigned_advisor",
            "assigned_advisor_name",
            "srs_document",
            "srs_status",
            "srs_feedback",
            "srs_revision_deadline",
            "channels_active",
            "documentation_deadline",
            "implementation_deadline",
            "documentation_submission",
            "documentation_submitted_at",
            "implementation_submission",
            "implementation_repo_url",
            "implementation_submitted_at",
            "implementation_verified_by_advisor",
            "advisor_verification_notes",
            "advisor_rating",
            "advisor_score",
            "uil_score",
            "uil_score_sealed",
            "uil_score_sheet_qr",
            "documentation_score",
            "presentation_score",
            "final_composite_score",
            "final_grade_letter",
            "is_unsealed_by_dean",
            "defense_scheduled_at",
            "defense_venue",
            "google_meet_url",
            "members",
            "created_at",
            "updated_at",
        ]

    def get_assigned_advisor_name(self, obj):
        return obj.assigned_advisor.full_name if obj.assigned_advisor else None


from apps.teams.models import InternshipProgram, TeamChannelMessage


class InternshipProgramSerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source="cohort.university_name", read_only=True)

    class Meta:
        model = InternshipProgram
        fields = [
            "id",
            "cohort",
            "cohort_name",
            "name",
            "description",
            "target_quota",
            "enrolled_count",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeamChannelMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField(read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)

    class Meta:
        model = TeamChannelMessage
        fields = [
            "id",
            "team",
            "channel_type",
            "sender",
            "sender_name",
            "sender_role",
            "recipient",
            "message",
            "meet_url",
            "attachment",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "created_at"]

    def get_sender_name(self, obj):
        return obj.sender.full_name if obj.sender else ""


class SRSReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject"])
    feedback = serializers.CharField(required=False, allow_blank=True, default="")


class WeeklyLogbookSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyLogbook
        fields = [
            "id",
            "team",
            "student",
            "week_number",
            "tasks_planned",
            "tasks_executed",
            "challenges_faced",
            "git_commit_urls",
            "similarity_score",
            "is_flagged",
            "advisor_approved",
            "advisor_feedback",
            "submitted_at",
        ]
        read_only_fields = ["id", "team", "student", "similarity_score", "is_flagged", "submitted_at"]
