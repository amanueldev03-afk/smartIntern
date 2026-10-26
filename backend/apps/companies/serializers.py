from rest_framework import serializers

from .models import Company


class CompanySerializer(serializers.ModelSerializer):
    """
    Serializer for Company (Section 3.6 / Phase 4 Task 4.1).

    Only an administrator may create/update/delete companies, so the full
    field set is writable through the admin-only endpoints.
    """

    internship_count = serializers.IntegerField(
        read_only=True,
        help_text="Number of internships published by this company.",
    )

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "country",
            "industry",
            "internship_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "internship_count",
            "created_at",
            "updated_at",
        ]


from .models import CompanyStudentInvitation


class CompanyStudentInvitationSerializer(serializers.ModelSerializer):
    internship_title = serializers.CharField(source="internship.title", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    student_id_number = serializers.CharField(source="student.student_id_number", read_only=True)
    student_name = serializers.SerializerMethodField()
    student_department = serializers.CharField(source="student.department", read_only=True)

    class Meta:
        model = CompanyStudentInvitation
        fields = [
            "id",
            "internship",
            "internship_title",
            "company",
            "company_name",
            "student",
            "student_id_number",
            "student_name",
            "student_department",
            "requirements_note",
            "status",
            "created_at",
            "responded_at",
        ]
        read_only_fields = ["id", "created_at", "responded_at"]

    def get_student_name(self, obj):
        user = getattr(obj.student, "user", None)
        return user.full_name if user else obj.student.student_id_number