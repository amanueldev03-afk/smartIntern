import logging
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from apps.teams.models import InHouseCohort, ProjectTeam, TeamMember, WeeklyLogbook
from apps.teams.serializers import (
    InHouseCohortSerializer,
    ProjectTeamSerializer,
    SRSReviewSerializer,
    WeeklyLogbookSerializer,
)
from apps.teams.services.balancer import balance_inhouse_teams
from apps.teams.tasks import verify_logbook_task

logger = logging.getLogger(__name__)


class CohortBalanceTeamsView(APIView):
    """
    POST /api/v1/teams/cohorts/<uuid:cohort_id>/balance/

    Balances and forms squads of ~2 Frontend, ~2 Backend, ~1 DevOps
    from accepted cohort candidates, designating squad leaders.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, cohort_id, *args, **kwargs):
        cohort = get_object_or_404(InHouseCohort, id=cohort_id)
        squad_size = int(request.data.get("squad_size", 5))

        teams = balance_inhouse_teams(cohort.id, squad_size=squad_size)
        serializer = ProjectTeamSerializer(teams, many=True)
        return Response(
            {
                "cohort_id": str(cohort.id),
                "university_name": cohort.university_name,
                "teams_created": len(teams),
                "teams": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class SRSReviewView(APIView):
    """
    POST /api/v1/teams/<uuid:team_id>/srs/review/

    Advisor review of the team's Software Requirements Specification (SRS).
    - If APPROVED: Unlocks the Documentation Gate for coding & weekly logbooks.
    - If REJECTED: Opens a 2-week revision deadline with advisor feedback notes.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, team_id, *args, **kwargs):
        team = get_object_or_404(ProjectTeam, id=team_id)

        serializer = SRSReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data["action"]
        feedback = serializer.validated_data.get("feedback", "")

        if action == "approve":
            team.approve_srs(feedback=feedback)
            message = "SRS document approved. Coding phase and weekly logbook submissions are now unlocked."
        elif action == "reject":
            team.reject_srs(feedback=feedback, revision_days=14)
            message = "SRS document rejected. A 2-week revision window has been opened with advisor feedback."
        else:
            return Response({"detail": "Invalid review action."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "team_id": str(team.id),
                "srs_status": team.srs_status,
                "srs_feedback": team.srs_feedback,
                "srs_revision_deadline": team.srs_revision_deadline,
                "is_coding_unlocked": team.is_coding_unlocked,
                "message": message,
            },
            status=status.HTTP_200_OK,
        )


class WeeklyLogbookListCreateView(APIView):
    """
    GET  /api/v1/teams/logbooks/
    POST /api/v1/teams/logbooks/

    DOCUMENTATION GATE:
    Submitting weekly logbooks returns HTTP 403 Forbidden unless
    the student's squad SRS document status is 'APPROVED'.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        uil_profile = getattr(getattr(user, "student", None), "uil_student_profile", None)

        if uil_profile:
            logbooks = WeeklyLogbook.objects.filter(student=uil_profile)
        else:
            logbooks = WeeklyLogbook.objects.filter(team__assigned_advisor=user)

        serializer = WeeklyLogbookSerializer(logbooks, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        user = request.user
        base_student = getattr(user, "student", None)
        uil_profile = getattr(base_student, "uil_student_profile", None)

        if not uil_profile:
            return Response(
                {"detail": "No UIL student profile found for current user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Resolve student's project team
        membership = (
            TeamMember.objects
            .filter(student=uil_profile)
            .select_related("team")
            .first()
        )

        team = membership.team if membership else None
        if not team:
            team_id = request.data.get("team")
            if team_id:
                team = ProjectTeam.objects.filter(id=team_id).first()

        # 2. DOCUMENTATION GATE ENFORCEMENT
        # Submissions return HTTP 403 unless srs_status == 'APPROVED'
        if not team or team.srs_status != ProjectTeam.SRSStatus.APPROVED:
            current_status = team.srs_status if team else "NO_TEAM"
            return Response(
                {
                    "detail": "Documentation Gate Locked: Weekly logbook submission is prohibited until your team's SRS document has been APPROVED by the academic advisor.",
                    "srs_status": current_status,
                    "is_coding_unlocked": False,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # 3. Create logbook
        serializer = WeeklyLogbookSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        logbook = serializer.save(team=team, student=uil_profile)

        # 4. Trigger plagiarism verification task
        try:
            verify_logbook_task.delay(str(logbook.id))
        except Exception:
            verify_logbook_task(str(logbook.id))
            logbook.refresh_from_db()

        return Response(
            WeeklyLogbookSerializer(logbook).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectTeamDetailView(generics.RetrieveAPIView):
    """GET /api/v1/teams/<uuid:pk>/"""
    queryset = ProjectTeam.objects.all()
    serializer_class = ProjectTeamSerializer
    permission_classes = [IsAuthenticated]


# =============================================================================
# Track 1 Programs, Timers, Advisor Verification, QR Seal & Multi-Channel Chat
# =============================================================================

import hmac
import hashlib
import json
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from apps.accounts.permissions import IsUILOfficer, IsAcademicAdvisor, IsDeptDean, IsStudent
from apps.common.qr_generator import generate_base64_qr
from apps.teams.models import InternshipProgram, TeamChannelMessage
from apps.teams.serializers import InternshipProgramSerializer, TeamChannelMessageSerializer
from apps.uil_profiles.models import UILStudentProfile
from drf_spectacular.utils import extend_schema
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser


@extend_schema(tags=["Teams"])
class ProjectTeamListView(generics.ListAPIView):
    """
    List project teams with filtering by cohort, advisor, or current user.
    GET /api/v1/teams/
    """
    serializer_class = ProjectTeamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ProjectTeam.objects.select_related("cohort", "assigned_advisor").prefetch_related("members__student__student__user").all()
        cohort_id = self.request.query_params.get("cohort_id")
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)
        if getattr(user, "role", "") == "ADVISOR":
            qs = qs.filter(assigned_advisor=user)
        return qs.order_by("team_name")


@extend_schema(tags=["UIL"])
class UILProgramListCreateView(generics.ListCreateAPIView):
    """
    UIL Officer manages internship programs and target student quotas.
    GET /api/v1/teams/programs/
    POST /api/v1/teams/programs/
    """
    serializer_class = InternshipProgramSerializer
    permission_classes = [IsAuthenticated, IsUILOfficer]
    queryset = InternshipProgram.objects.all().order_by("-created_at")


@extend_schema(tags=["UIL"])
class UILProgramAssignStudentsView(APIView):
    """
    UIL Officer assigns accepted students into an internship program.
    POST /api/v1/teams/programs/<uuid:pk>/assign-students/
    Body: {"student_ids": [...]}
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def post(self, request, pk):
        program = get_object_or_404(InternshipProgram, id=pk)
        student_ids = request.data.get("student_ids", [])
        if not isinstance(student_ids, list) or not student_ids:
            return Response({"detail": "student_ids list is required."}, status=status.HTTP_400_BAD_REQUEST)

        valid_students = UILStudentProfile.objects.filter(id__in=student_ids)
        added_count = valid_students.count()

        if program.cohort:
            program.cohort.accepted_students.add(*valid_students)
            program.cohort.enrolled_count = program.cohort.accepted_students.count()
            program.cohort.save()

        program.enrolled_count += added_count
        program.save()

        return Response({
            "message": f"Successfully assigned {added_count} students to '{program.name}'.",
            "enrolled_count": program.enrolled_count,
            "target_quota": program.target_quota,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Teams"])
class ProjectTeamDocumentationSubmitView(APIView):
    """
    Student submits documentation before the countdown deadline.
    Disabled/rejected if countdown deadline has passed.
    POST /api/v1/teams/<uuid:team_id>/submit-documentation/
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)

        # Countdown deadline enforcement
        if team.documentation_deadline and timezone.now() > team.documentation_deadline:
            return Response(
                {"detail": "Documentation submission deadline has expired. Submissions are now disabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        doc_file = request.FILES.get("documentation_submission")
        if doc_file:
            team.documentation_submission = doc_file
            team.srs_document = doc_file
        
        team.documentation_submitted_at = timezone.now()
        team.srs_status = ProjectTeam.SRSStatus.SUBMITTED
        team.save()

        return Response({
            "message": "Documentation submitted successfully.",
            "srs_status": team.srs_status,
            "submitted_at": team.documentation_submitted_at.isoformat(),
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["UIL"])
class ProjectTeamDocumentationReviewView(APIView):
    """
    UIL Officer reviews team documentation.
    Approving starts the implementation countdown timer!
    POST /api/v1/teams/<uuid:team_id>/review-documentation/
    Body: {"action": "approve"|"reject", "comments": "...", "implementation_days": 30}
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        action = request.data.get("action", "").strip().lower()
        comments = request.data.get("comments", "")
        days = int(request.data.get("implementation_days", 30))

        if action == "approve":
            team.srs_status = ProjectTeam.SRSStatus.APPROVED
            team.srs_feedback = comments
            team.implementation_deadline = timezone.now() + timezone.timedelta(days=days)
            team.save()
            return Response({
                "message": f"Documentation approved. Implementation countdown timer started ({days} days).",
                "srs_status": team.srs_status,
                "implementation_deadline": team.implementation_deadline.isoformat(),
            }, status=status.HTTP_200_OK)
        elif action == "reject":
            team.srs_status = ProjectTeam.SRSStatus.REJECTED
            team.srs_feedback = comments
            team.save()
            return Response({
                "message": "Documentation rejected with revision feedback.",
                "srs_status": team.srs_status,
                "feedback": comments,
            }, status=status.HTTP_200_OK)
        else:
            return Response({"detail": "Action must be 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(tags=["Teams"])
class ProjectTeamImplementationSubmitView(APIView):
    """
    Student submits implementation code/repo before the countdown deadline.
    Disabled/rejected if countdown deadline has passed.
    POST /api/v1/teams/<uuid:team_id>/submit-implementation/
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)

        # Countdown deadline enforcement
        if team.implementation_deadline and timezone.now() > team.implementation_deadline:
            return Response(
                {"detail": "Implementation submission deadline has expired. Submissions are now disabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        impl_file = request.FILES.get("implementation_submission")
        repo_url = request.data.get("implementation_repo_url", "").strip()

        if impl_file:
            team.implementation_submission = impl_file
        if repo_url:
            team.implementation_repo_url = repo_url

        team.implementation_submitted_at = timezone.now()
        team.save()

        return Response({
            "message": "Implementation submission received successfully.",
            "repo_url": team.implementation_repo_url,
            "submitted_at": team.implementation_submitted_at.isoformat(),
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Academic Advisor"])
class AdvisorVerifyImplementationView(APIView):
    """
    Academic Advisor verifies squad implementation, inputs ratings, notes, and score.
    POST /api/v1/teams/<uuid:team_id>/advisor-verify/
    Body: {"rating": 4.8, "notes": "...", "score": 24.0}
    """
    permission_classes = [IsAuthenticated, IsAcademicAdvisor]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        rating = request.data.get("rating")
        notes = request.data.get("notes", "")
        score = request.data.get("score")

        team.implementation_verified_by_advisor = True
        team.advisor_verification_notes = notes
        if rating is not None:
            team.advisor_rating = Decimal(str(rating))
        if score is not None:
            team.advisor_score = Decimal(str(score))
        team.save()

        return Response({
            "message": f"Implementation verified for team '{team.team_name}'. Notes forwarded to UIL Officer.",
            "advisor_rating": str(team.advisor_rating or ""),
            "advisor_score": str(team.advisor_score or ""),
            "notes": team.advisor_verification_notes,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["UIL"])
class UILScoreAndSealView(APIView):
    """
    UIL Officer inputs UIL score (out of 25) and seals score sheet with Base64 QR code.
    Unviewable to students until Dean unseals it.
    POST /api/v1/teams/<uuid:team_id>/uil-score-seal/
    Body: {"uil_score": 23.5}
    """
    permission_classes = [IsAuthenticated, IsUILOfficer]

    def post(self, request, team_id):
        team = get_object_or_404(ProjectTeam, id=team_id)
        score = request.data.get("uil_score")
        if score is None:
            return Response({"detail": "uil_score is required."}, status=status.HTTP_400_BAD_REQUEST)

        team.uil_score = Decimal(str(score))
        team.uil_score_sealed = True

        # Generate cryptographic QR code sealing the UIL score sheet
        msg = f"UIL_SEAL:{team.id}:{team.uil_score}:{request.user.id}:{timezone.now().isoformat()}"
        sig = hmac.new(settings.SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
        seal_payload = json.dumps({
            "doc_type": "UIL_OFFICIAL_SEALED_SCORE_SHEET",
            "team_id": str(team.id),
            "team_name": team.team_name,
            "project_title": team.project_title,
            "uil_officer": request.user.email,
            "uil_score": str(team.uil_score),
            "signature": sig,
            "sealed_at": timezone.now().isoformat(),
        })
        team.uil_score_sheet_qr = generate_base64_qr(seal_payload)
        team.save()

        return Response({
            "message": f"Score sheet for team '{team.team_name}' sealed successfully with UIL QR signature.",
            "uil_score": str(team.uil_score),
            "uil_score_sealed": True,
            "uil_score_sheet_qr": team.uil_score_sheet_qr,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Teams"])
class TeamChannelMessageListView(generics.ListAPIView):
    """
    List messages in a team communication channel.
    GET /api/v1/teams/<uuid:team_id>/messages/?channel_type=SQUAD_INTERNAL
    """
    serializer_class = TeamChannelMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        team_id = self.kwargs["team_id"]
        channel_type = self.request.query_params.get("channel_type", TeamChannelMessage.ChannelType.SQUAD_INTERNAL)
        return TeamChannelMessage.objects.filter(
            team_id=team_id,
            channel_type=channel_type,
        ).select_related("sender", "recipient").order_by("created_at")


@extend_schema(tags=["Teams"])
class TeamChannelMessageSendView(generics.CreateAPIView):
    """
    Send a message in a squad communication channel (Internal, UIL, Advisor + Meet Link, Dean).
    POST /api/v1/teams/<uuid:team_id>/messages/
    Body: {"channel_type": "...", "message": "...", "meet_url": "..."}
    """
    serializer_class = TeamChannelMessageSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        team = get_object_or_404(ProjectTeam, id=self.kwargs["team_id"])
        channel_type = self.request.data.get("channel_type", TeamChannelMessage.ChannelType.SQUAD_INTERNAL)
        meet_url = self.request.data.get("meet_url", "").strip()

        # If meet_url provided in Squad+Advisor channel, update team's meet link as well
        if meet_url and channel_type == TeamChannelMessage.ChannelType.SQUAD_ADVISOR:
            team.google_meet_url = meet_url
            team.save(update_fields=["google_meet_url"])

        serializer.save(
            team=team,
            sender=self.request.user,
            channel_type=channel_type,
            meet_url=meet_url,
        )

