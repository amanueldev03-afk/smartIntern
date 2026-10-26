from django.db.models import Count
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from drf_spectacular.utils import extend_schema, OpenApiExample

from .models import Company
from .serializers import CompanySerializer
from apps.internships.permissions import IsAdminRole


class CompanyPagination(PageNumberPagination):
    """
    Pagination for the admin company listing.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminCompanyListCreateView(generics.ListCreateAPIView):
    """
    Admin can list and create companies (Phase 4 Task 4.1).

    For both GET and POST the endpoint is gated by ``IsAdminRole`` (Task 2.6):
    a student JWT receives 403.
    """

    serializer_class = CompanySerializer
    permission_classes = [IsAdminRole]
    pagination_class = CompanyPagination

    @extend_schema(
        summary="Admin: List companies",
        description="Retrieve a paginated list of all companies, including a live internship count per company. Admin only.",
        tags=["Companies"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        summary="Admin: Create company",
        description="Create a new company. Company names must be unique. Admin only.",
        request=CompanySerializer,
        responses={201: CompanySerializer},
        examples=[
            OpenApiExample(
                "Create Company",
                value={
                    "name": "Google LLC",
                    "website": "https://careers.google.com",
                    "country": "United States",
                    "industry": "Technology",
                },
            )
        ],
        tags=["Companies"],
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def get_queryset(self):
        return Company.objects.annotate(
            internship_count=Count("internships")
        ).order_by("name")


class AdminCompanyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Admin can retrieve, update, and delete a single company (Phase 4 Task 4.1).

    Deleting a company nulls out its internships' ``company`` link
    (``on_delete=SET_NULL``, migration ``0018``) — listings survive but are
    no longer attributed.
    """

    serializer_class = CompanySerializer
    permission_classes = [IsAdminRole]
    queryset = Company.objects.annotate(
        internship_count=Count("internships")
    )

    @extend_schema(
        summary="Admin: Retrieve company",
        description="Get detailed information about a company by ID. Admin only.",
        tags=["Companies"],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        summary="Admin: Update company",
        description="Update a company by ID. Admin only.",
        request=CompanySerializer,
        responses={200: CompanySerializer},
        tags=["Companies"],
    )
    def put(self, request, *args, **kwargs):
        return super().put(request, *args, **kwargs)

    @extend_schema(
        summary="Admin: Partial update company",
        description="Partially update a company by ID. Admin only.",
        request=CompanySerializer,
        responses={200: CompanySerializer},
        tags=["Companies"],
    )
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    @extend_schema(
        summary="Admin: Delete company",
        description="Delete a company by ID. Its internships' links are nulled. Admin only.",
        tags=["Companies"],
    )
    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)


from apps.internships.models import Internship, InternshipApplication
from apps.internships.serializers import InternshipSerializer, InternshipApplicationSerializer
from apps.internships.permissions import IsCompanyHROrAdmin
from rest_framework.response import Response


class EmployerInternshipListCreateView(generics.ListCreateAPIView):
    """
    List and create internships for employers/companies.
    GET /api/companies/my-internships/
    POST /api/companies/my-internships/
    """
    serializer_class = InternshipSerializer
    permission_classes = [IsCompanyHROrAdmin]

    def get_queryset(self):
        return Internship.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        user = self.request.user
        company = getattr(user, "company", None)
        if not company:
            company = Company.objects.first()
        serializer.save(
            company=company,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=False,
            is_published=False,
        )


class EmployerApplicationListView(generics.ListAPIView):
    """
    List student applications received for company internships.
    GET /api/companies/applications/
    """
    serializer_class = InternshipApplicationSerializer
    permission_classes = [IsCompanyHROrAdmin]

    def get_queryset(self):
        qs = InternshipApplication.objects.select_related("student", "internship").all().order_by("-created_at")
        internship_id = self.request.query_params.get("internship_id")
        if internship_id:
            qs = qs.filter(internship_id=internship_id)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        return qs


class EmployerApplicationUpdateView(generics.UpdateAPIView):
    """
    Update application status (interview, accepted, rejected).
    PATCH /api/companies/applications/<id>/status/
    """
    serializer_class = InternshipApplicationSerializer
    permission_classes = [IsCompanyHROrAdmin]
    queryset = InternshipApplication.objects.all()

    def patch(self, request, *args, **kwargs):
        app = self.get_object()
        new_status = request.data.get("status")
        notes = request.data.get("notes")
        if new_status:
            app.status = new_status
        if notes is not None:
            app.notes = notes
        app.save()
        return Response(InternshipApplicationSerializer(app).data)


# =============================================================================
# Track 1 AI Recommended Students, Direct Invitations & Chat Views
# =============================================================================

from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import CompanyStudentInvitation
from .serializers import CompanyStudentInvitationSerializer
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import TeamChannelMessage
from apps.accounts.permissions import IsStudent
from django.db.models import Q


@extend_schema(tags=["Companies"])
class CompanyRecommendedStudentsView(generics.GenericAPIView):
    """
    AI Match Recommendation: Rank qualified students for an employer's internship.
    GET /api/companies/internships/<int:pk>/recommended-students/
    """
    permission_classes = [IsCompanyHROrAdmin]

    def get(self, request, pk):
        internship = get_object_or_404(Internship, pk=pk)
        required_skills = set(internship.required_skills.values_list("name", flat=True))
        students = UILStudentProfile.objects.select_related("student__user").all()

        results = []
        for stu in students:
            user = getattr(stu, "user", None)
            if not user:
                continue

            # Student skills from StudentSkill
            stu_skills = set()
            if hasattr(stu.student, "skills"):
                stu_skills = set(stu.student.skills.values_list("name", flat=True))
            
            # Match calculation
            matched_skills = list(required_skills.intersection(stu_skills)) if required_skills else []
            missing_skills = list(required_skills.difference(stu_skills)) if required_skills else []
            
            skill_score = (len(matched_skills) / len(required_skills)) if required_skills else 0.8
            gpa_score = (float(stu.gpa) / 4.0) if stu.gpa else 0.75
            year_score = min(float(stu.academic_year) / 4.0, 1.0) if stu.academic_year else 0.75

            # Composite AI Match percentage (0-100)
            composite_score = round((skill_score * 0.55 + gpa_score * 0.25 + year_score * 0.20) * 100, 1)

            # Check if invitation was sent
            invitation = CompanyStudentInvitation.objects.filter(
                internship=internship,
                student=stu,
            ).first()

            results.append({
                "student_id": str(stu.id),
                "student_id_number": stu.student_id_number,
                "full_name": user.full_name,
                "email": user.email,
                "department": stu.department,
                "academic_year": stu.academic_year,
                "gpa": str(stu.gpa) if stu.gpa else None,
                "github_url": stu.github_url,
                "skills": list(stu_skills),
                "match_score": composite_score,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
                "invitation_status": invitation.status if invitation else None,
                "invitation_id": str(invitation.id) if invitation else None,
            })

        # Sort descending by match score
        results.sort(key=lambda x: x["match_score"], reverse=True)
        return Response({
            "internship_id": internship.id,
            "internship_title": internship.title,
            "required_skills": list(required_skills),
            "recommendations": results,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Companies"])
class CompanyStudentInvitationCreateView(generics.CreateAPIView):
    """
    Company sends an invitation with requirements notes to an AI-matched student.
    POST /api/companies/invitations/
    Body: {"internship_id": ..., "student_id": ..., "requirements_note": "..."}
    """
    permission_classes = [IsCompanyHROrAdmin]
    serializer_class = CompanyStudentInvitationSerializer

    def create(self, request, *args, **kwargs):
        internship_id = request.data.get("internship_id")
        student_id = request.data.get("student_id")
        requirements_note = request.data.get("requirements_note", "")

        internship = get_object_or_404(Internship, id=internship_id)
        student = get_object_or_404(UILStudentProfile, id=student_id)
        company = internship.company or getattr(request.user, "company", None)

        invitation, created = CompanyStudentInvitation.objects.update_or_create(
            internship=internship,
            student=student,
            defaults={
                "company": company,
                "requirements_note": requirements_note,
                "status": CompanyStudentInvitation.Status.PENDING,
            }
        )
        return Response(CompanyStudentInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Students"])
class StudentInvitationListView(generics.ListAPIView):
    """
    List invitations received by the authenticated student.
    GET /api/students/invitations/
    """
    permission_classes = [IsStudent]
    serializer_class = CompanyStudentInvitationSerializer

    def get_queryset(self):
        user = self.request.user
        return CompanyStudentInvitation.objects.filter(
            student__student__user=user
        ).select_related("internship", "company", "student").order_by("-created_at")


@extend_schema(tags=["Students"])
class StudentInvitationRespondView(generics.GenericAPIView):
    """
    Student accepts or declines an invitation.
    POST /api/students/invitations/<uuid:pk>/respond/
    Body: {"action": "accept"|"decline"}
    """
    permission_classes = [IsStudent]

    def post(self, request, pk):
        invitation = get_object_or_404(
            CompanyStudentInvitation,
            id=pk,
            student__student__user=request.user,
        )
        action = request.data.get("action", "").strip().lower()
        if action not in ["accept", "decline"]:
            return Response({"detail": "Action must be 'accept' or 'decline'."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "accept":
            invitation.status = CompanyStudentInvitation.Status.ACCEPTED
            invitation.responded_at = timezone.now()
            invitation.save()

            company_user = None
            if invitation.company:
                company_user = getattr(invitation.company, "user", None)
            if not company_user:
                company_user = getattr(invitation.internship, "published_by", None)

            # Auto-create direct welcome message to start the Student-Company chat
            TeamChannelMessage.objects.create(
                channel_type=TeamChannelMessage.ChannelType.STUDENT_COMPANY,
                sender=request.user,
                recipient=company_user,
                message=f"Hello! I have accepted your invitation for the '{invitation.internship.title}' internship. I look forward to our discussion.",
            )

            return Response({
                "message": "Invitation accepted successfully. Direct chat channel is now unlocked.",
                "invitation": CompanyStudentInvitationSerializer(invitation).data,
            }, status=status.HTTP_200_OK)
        else:
            invitation.status = CompanyStudentInvitation.Status.DECLINED
            invitation.responded_at = timezone.now()
            invitation.save()
            return Response({
                "message": "Invitation declined.",
                "invitation": CompanyStudentInvitationSerializer(invitation).data,
            }, status=status.HTTP_200_OK)


@extend_schema(tags=["Companies"])
class CompanyDirectChatListView(generics.GenericAPIView):
    """
    Retrieve direct chat messages between student and company.
    GET /api/companies/chat/<uuid:invitation_id>/
    """
    def get(self, request, invitation_id):
        invitation = get_object_or_404(CompanyStudentInvitation, id=invitation_id)
        student_user = getattr(invitation.student, "user", None)
        
        messages = TeamChannelMessage.objects.filter(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_COMPANY,
        ).filter(
            Q(sender=student_user) | Q(recipient=student_user)
        ).order_by("created_at")

        data = [
            {
                "id": str(m.id),
                "sender_id": str(m.sender.id),
                "sender_name": m.sender.full_name,
                "sender_role": m.sender.role,
                "message": m.message,
                "meet_url": m.meet_url,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
        return Response(data, status=status.HTTP_200_OK)


@extend_schema(tags=["Companies"])
class CompanyDirectChatSendView(generics.GenericAPIView):
    """
    Send a message in the direct chat between student and company.
    POST /api/companies/chat/<uuid:invitation_id>/send/
    Body: {"message": "...", "meet_url": "..."}
    """
    def post(self, request, invitation_id):
        invitation = get_object_or_404(CompanyStudentInvitation, id=invitation_id)
        if invitation.status != CompanyStudentInvitation.Status.ACCEPTED:
            return Response({"detail": "Chat is only available for accepted invitations."}, status=status.HTTP_400_BAD_REQUEST)

        message_text = request.data.get("message", "").strip()
        meet_url = request.data.get("meet_url", "").strip()
        if not message_text and not meet_url:
            return Response({"detail": "Message text or meet URL is required."}, status=status.HTTP_400_BAD_REQUEST)

        student_user = getattr(invitation.student, "user", None)
        recipient = None
        if request.user == student_user:
            recipient = getattr(invitation.company, "user", None) or getattr(invitation.internship, "published_by", None)
        else:
            recipient = student_user

        msg = TeamChannelMessage.objects.create(
            channel_type=TeamChannelMessage.ChannelType.STUDENT_COMPANY,
            sender=request.user,
            recipient=recipient,
            message=message_text,
            meet_url=meet_url,
        )

        return Response({
            "id": str(msg.id),
            "sender_id": str(msg.sender.id),
            "sender_name": msg.sender.full_name,
            "sender_role": msg.sender.role,
            "message": msg.message,
            "meet_url": msg.meet_url,
            "created_at": msg.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)