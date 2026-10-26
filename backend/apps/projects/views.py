import logging
from rest_framework import generics, permissions, status, exceptions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.accounts.permissions import IsStudent, IsAcademicAdvisor, IsCompanyMentor
from .models import WeeklyLogbook, LogbookAlert, ProjectTeam, TeamMember, ProjectTeamMessage
from .serializers import (
    WeeklyLogbookSerializer,
    WeeklyLogbookApprovalSerializer,
    LogbookAlertSerializer,
    ProjectTeamSerializer,
    TeamMemberSerializer,
    SRSDocumentUploadSerializer,
    SRSAdvisorReviewSerializer,
    InHouseCohortSerializer,
    ProjectTeamMessageSerializer,
)
from .tasks import verify_logbook_task

logger = logging.getLogger(__name__)
User = get_user_model()


class WeeklyLogbookListCreateView(generics.ListCreateAPIView):
    """
    POST: Submit a weekly logbook (student role). Enqueues asynchronous plagiarism verification.
          Enforces the Track 1 SRS Documentation Gate: If student belongs to an in-house project
          team, srs_status must be 'APPROVED' before coding-phase actions and weekly log submissions unlock.
    GET: List logbooks relevant to the requesting user (student, advisor, mentor, admin).
    """
    serializer_class = WeeklyLogbookSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", None)

        if role == User.Role.STUDENT:
            return WeeklyLogbook.objects.filter(student=user)
        elif role == User.Role.ADVISOR:
            # Advisors view their supervised logbooks or all unassigned student logbooks
            supervised = WeeklyLogbook.objects.filter(academic_advisor=user)
            if supervised.exists():
                return supervised
            return WeeklyLogbook.objects.all()
        elif role == User.Role.COMPANY_MENTOR:
            # Mentors view their mentored logbooks
            mentored = WeeklyLogbook.objects.filter(company_mentor=user)
            if mentored.exists():
                return mentored
            return WeeklyLogbook.objects.all()
        elif user.is_staff or role == User.Role.ADMIN:
            return WeeklyLogbook.objects.all()

        return WeeklyLogbook.objects.filter(student=user)

    def create(self, request, *args, **kwargs):
        user = request.user

        # Track 1 Documentation Gate: Check if student belongs to an In-House ProjectTeam
        profile = getattr(user, "student_profile", None)
        if not profile:
            from apps.accounts.models import StudentProfile
            profile = StudentProfile.objects.filter(user=user).first()

        associated_team = None
        if profile:
            membership = TeamMember.objects.filter(student=profile).select_related("team").first()
            if membership and membership.team:
                associated_team = membership.team

        # Also support explicit team in payload if specified
        target_team_id = request.data.get("project_team") or request.data.get("team_id")
        if target_team_id:
            try:
                associated_team = ProjectTeam.objects.get(id=target_team_id)
            except (ProjectTeam.DoesNotExist, ValueError):
                pass

        if associated_team and associated_team.srs_status != ProjectTeam.SRSStatus.APPROVED:
            return Response(
                {
                    "detail": "Documentation (SRS) must be approved before coding-phase actions (Git commit logging, daily tasks, weekly sprint submissions) are unlocked.",
                    "srs_status": associated_team.srs_status,
                    "srs_feedback": associated_team.srs_feedback,
                    "srs_revision_deadline": associated_team.srs_revision_deadline,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer, project_team=associated_team)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer, project_team=None):
        if project_team and "project_team" not in serializer.validated_data:
            logbook = serializer.save(student=self.request.user, project_team=project_team)
        else:
            logbook = serializer.save(student=self.request.user)
        logger.info(f"Logbook {logbook.id} submitted by {self.request.user.email} for week {logbook.week_number}")
        # Enqueue async verification task
        try:
            verify_logbook_task.delay(str(logbook.id))
        except Exception as exc:
            # In test or non-celery environment, fallback if needed or log
            logger.warning(f"Could not enqueue verify_logbook_task via Celery: {exc}")


class WeeklyLogbookDetailView(generics.RetrieveAPIView):
    """
    GET: Retrieve details of a weekly logbook including similarity score and review status.
    """
    queryset = WeeklyLogbook.objects.all()
    serializer_class = WeeklyLogbookSerializer
    permission_classes = [permissions.IsAuthenticated]


class WeeklyLogbookAdvisorApprovalView(generics.UpdateAPIView):
    """
    PATCH: Academic advisor approval and feedback submission.
    """
    queryset = WeeklyLogbook.objects.all()
    serializer_class = WeeklyLogbookApprovalSerializer
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        logbook = self.get_object()
        serializer = self.get_serializer(logbook, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info(
            f"Logbook {logbook.id} updated by {request.user.email}: "
            f"approved={logbook.advisor_approved}"
        )
        full_serializer = WeeklyLogbookSerializer(logbook)
        return Response(full_serializer.data, status=status.HTTP_200_OK)


class LogbookAlertListView(generics.ListAPIView):
    """
    GET: List in-app alerts dispatched to the authenticated supervisor (Advisor or Mentor).
    """
    serializer_class = LogbookAlertSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return LogbookAlert.objects.filter(recipient=self.request.user)


class LogbookAlertMarkReadView(generics.UpdateAPIView):
    """
    PATCH: Mark an in-app alert as read.
    """
    queryset = LogbookAlert.objects.all()
    serializer_class = LogbookAlertSerializer
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        alert = self.get_object()
        if alert.recipient != request.user and not request.user.is_staff:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        alert.is_read = True
        alert.save(update_fields=["is_read", "updated_at"])
        return Response(self.get_serializer(alert).data, status=status.HTTP_200_OK)


class ProjectTeamDetailView(generics.RetrieveAPIView):
    """
    GET: Retrieve details of a project squad including members and SRS status.
    """
    queryset = ProjectTeam.objects.all()
    serializer_class = ProjectTeamSerializer
    permission_classes = [permissions.IsAuthenticated]


class SRSDocumentUploadView(generics.GenericAPIView):
    """
    POST: Upload Software Requirements Specification (SRS) PDF for a project squad.
    Transitions SRS status to 'SUBMITTED'.
    """
    queryset = ProjectTeam.objects.all()
    serializer_class = SRSDocumentUploadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        team = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team.srs_document = serializer.validated_data["srs_document"]
        team.srs_status = ProjectTeam.SRSStatus.SUBMITTED
        team.save(update_fields=["srs_document", "srs_status", "updated_at"])
        logger.info(f"Team {team.id} uploaded SRS document (status=SUBMITTED)")

        return Response(
            ProjectTeamSerializer(team).data,
            status=status.HTTP_200_OK,
        )


class SRSAdvisorReviewView(generics.GenericAPIView):
    """
    PATCH / POST: Advisor review for the uploaded SRS document.
    - If 'APPROVED': unlocks sprint board and coding-phase actions.
    - If 'REJECTED': opens a 2-week revision deadline with advisor feedback notes.
    """
    queryset = ProjectTeam.objects.all()
    serializer_class = SRSAdvisorReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        return self._handle_review(request)

    def patch(self, request, *args, **kwargs):
        return self._handle_review(request)

    def _handle_review(self, request):
        user = request.user
        role = getattr(user, "role", None)
        team = self.get_object()

        # Permission check: must be advisor, UIL officer, admin, or staff
        if role not in [User.Role.ADVISOR, User.Role.ADMIN, User.Role.UIL_OFFICER] and not user.is_staff:
            if team.assigned_advisor != user:
                return Response(
                    {"detail": "Only academic advisors or administrators can evaluate SRS documents."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["srs_status"]
        feedback = serializer.validated_data.get("srs_feedback", "")

        if new_status == ProjectTeam.SRSStatus.APPROVED:
            team.approve_srs(feedback=feedback)
            logger.info(f"Team {team.id} SRS APPROVED by {user.email}")
        elif new_status == ProjectTeam.SRSStatus.REJECTED:
            team.reject_srs(feedback=feedback, revision_days=14)
            logger.info(f"Team {team.id} SRS REJECTED by {user.email}. 2-week revision deadline set.")

        # Post automatic advisory feedback message to squad channel
        if feedback:
            try:
                ProjectTeamMessage.objects.create(
                    team=team,
                    sender=user,
                    message=f"SRS Review Decision: {new_status}.\n\nAdvisor Notes: {feedback}",
                    message_type=ProjectTeamMessage.MessageType.SRS_FEEDBACK,
                )
            except Exception as e:
                logger.warning(f"Could not auto-post SRS review message: {e}")

        return Response(
            ProjectTeamSerializer(team).data,
            status=status.HTTP_200_OK,
        )


class ProjectTeamSprintBoardView(generics.RetrieveAPIView):
    """
    GET: Retrieve the implementation sprint board for a project squad.
    Enforces Documentation Gate: returns HTTP 403 Forbidden if srs_status != 'APPROVED'.
    """
    queryset = ProjectTeam.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        team = self.get_object()
        if team.srs_status != ProjectTeam.SRSStatus.APPROVED:
            return Response(
                {
                    "detail": "Implementation sprint board is locked until Documentation (SRS) is approved by your advisor.",
                    "unlocked": False,
                    "srs_status": team.srs_status,
                    "srs_feedback": team.srs_feedback,
                    "srs_revision_deadline": team.srs_revision_deadline,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(
            {
                "unlocked": True,
                "team_id": str(team.id),
                "team_name": team.team_name,
                "project_title": team.project_title,
                "srs_status": team.srs_status,
                "channels_active": team.channels_active,
                "members": TeamMemberSerializer(team.members.all(), many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class InHouseCohortBalanceView(generics.GenericAPIView):
    """
    POST: Formulate balanced squads for a Track 1 in-house cohort.
    Triggered by UIL Head Officer or Admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, cohort_id, *args, **kwargs):
        user = request.user
        role = getattr(user, "role", None)
        if role not in [User.Role.UIL_OFFICER, User.Role.ADMIN] and not user.is_staff:
            return Response(
                {"detail": "Only UIL Officers or Administrators can trigger team formulation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .services.balancer import balance_inhouse_teams
        squad_size = int(request.data.get("squad_size", 5))

        try:
            teams = balance_inhouse_teams(str(cohort_id), squad_size=squad_size)
            return Response(
                ProjectTeamSerializer(teams, many=True).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ProjectTeamListView(generics.ListAPIView):
    """
    GET: List project squads.
    - If Academic Advisor: lists assigned squads (or all if none specifically assigned).
    - If Student: lists the squad the student is a member of.
    - If Company Mentor: lists squads mentored by the user.
    - If UIL Officer, Dean, or Admin: lists all squads.
    Supports query parameters: ?cohort_id=... and ?srs_status=...
    """
    serializer_class = ProjectTeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role_upper = str(getattr(user, "role", "")).upper()
        qs = ProjectTeam.objects.select_related("cohort", "assigned_advisor").prefetch_related("members", "members__student", "members__student__user").all()

        cohort_id = self.request.query_params.get("cohort_id")
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)

        srs_status = self.request.query_params.get("srs_status")
        if srs_status:
            qs = qs.filter(srs_status__iexact=srs_status)

        if role_upper == User.Role.ADVISOR:
            advisor_teams = qs.filter(assigned_advisor=user)
            if advisor_teams.exists():
                return advisor_teams
            return qs
        elif role_upper == User.Role.STUDENT:
            return qs.filter(members__student__user=user).distinct()
        elif role_upper == User.Role.COMPANY_MENTOR:
            mentor_teams = qs.filter(company_mentor=user)
            if mentor_teams.exists():
                return mentor_teams
            return qs

        return qs


class InHouseCohortListCreateView(generics.ListCreateAPIView):
    """
    GET: List all Track 1 In-House Software House cohorts.
    POST: Create a new In-House cohort (UIL Officer, Dean, or Admin).
    """
    serializer_class = InHouseCohortSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from apps.teams.models import InHouseCohort
        return InHouseCohort.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        user = self.request.user
        role_upper = str(getattr(user, "role", "")).upper()
        if role_upper not in (User.Role.UIL_OFFICER, User.Role.DEPT_DEAN, User.Role.ADMIN) and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Only UIL Officers, Deans, or Administrators can create cohorts.")
        serializer.save()


class InHouseCohortDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve cohort details.
    PUT/PATCH: Update cohort attributes (title, capacity_k, department, dates, etc.).
    DELETE: Delete cohort from the platform.
    """
    serializer_class = InHouseCohortSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from apps.teams.models import InHouseCohort
        return InHouseCohort.objects.all()

    def check_permissions_role(self, user):
        role_upper = str(getattr(user, "role", "")).upper()
        if role_upper not in (User.Role.UIL_OFFICER, User.Role.DEPT_DEAN, User.Role.ADMIN) and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Only UIL Officers, Deans, or Administrators can modify or delete cohorts.")

    def perform_update(self, serializer):
        self.check_permissions_role(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        self.check_permissions_role(self.request.user)
        instance.delete()


class CohortVerifiedStudentsListView(APIView):
    """
    GET /api/v1/projects/cohorts/verified-students/
    List students officially verified by their Department Dean, showing GPA, Academic Year,
    skills, bio, contacts, and cohort invitation status for UIL Officer cohort inspection and invitation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role_upper = str(getattr(user, "role", "")).upper()
        if role_upper not in (User.Role.UIL_OFFICER, User.Role.DEPT_DEAN, User.Role.ADMIN) and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Only UIL Officers, Deans, or Administrators can view verified students.")

        from apps.uil_profiles.models import UILStudentProfile
        qs = (
            UILStudentProfile.objects.filter(is_verified_by_dean=True)
            .select_related("student__user")
            .prefetch_related(
                "student__skills",
                "student__interests",
                "invited_inhouse_cohorts",
                "inhouse_cohorts",
            )
            .order_by("-academic_year", "-gpa")
        )
        
        uil_univ = ""
        if role_upper == User.Role.UIL_OFFICER:
            from apps.uil_profiles.utils import get_user_university
            uil_univ = get_user_university(user)

        students_data = []
        for stu in qs:
            u = getattr(stu, "user", None)
            if not u and hasattr(stu, "student"):
                u = getattr(stu.student, "user", None)

            from apps.uil_profiles.utils import get_student_profile_university, universities_match
            stu_univ = get_student_profile_university(stu)
            if uil_univ and not universities_match(stu_univ, uil_univ):
                continue

            full_name = ""
            if u:
                full_name = f"{u.first_name} {u.last_name}".strip() or u.username
            if not full_name:
                full_name = stu.student_id_number or "Student Intern"

            skills_list = []
            interests_list = []
            if hasattr(stu, "student") and stu.student:
                skills_list = [s.name for s in stu.student.skills.all()]
                interests_list = [i.name for i in stu.student.interests.all()]

            invited_cohort_ids = [str(c.id) for c in stu.invited_inhouse_cohorts.all()]
            accepted_cohort_ids = [str(c.id) for c in stu.inhouse_cohorts.all()]

            students_data.append({
                "id": str(stu.id),
                "student_id_number": stu.student_id_number,
                "full_name": full_name,
                "email": u.email if u else "",
                "phone": getattr(u, "phone", "") if u else "",
                "bio": getattr(u, "bio", "") if u else "",
                "department": stu.department,
                "university": stu_univ,
                "campus_city": stu.campus_city,
                "academic_year": stu.academic_year,
                "gpa": str(stu.gpa) if stu.gpa else None,
                "github_url": stu.github_url or (getattr(u, "github_url", "") if u else ""),
                "linkedin_url": getattr(u, "linkedin_url", "") if u else "",
                "skills": skills_list,
                "interests": interests_list,
                "invited_cohort_ids": invited_cohort_ids,
                "accepted_cohort_ids": accepted_cohort_ids,
                "is_verified_by_dean": stu.is_verified_by_dean,
                "dean_verified_at": stu.dean_verified_at.isoformat() if stu.dean_verified_at else None,
                "forwarded_to_uil": stu.forwarded_to_uil,
            })

        return Response({"count": len(students_data), "students": students_data}, status=status.HTTP_200_OK)


class CohortInviteStudentView(APIView):
    """
    POST /api/v1/projects/cohorts/<uuid:cohort_id>/invite-student/
    UIL Officer invites or directly selects a Dean-verified student into a cohort up to capacity K.
    Dispatches in-app notification to the student's notification bell.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, cohort_id):
        user = request.user
        role_upper = str(getattr(user, "role", "")).upper()
        if role_upper not in (User.Role.UIL_OFFICER, User.Role.ADMIN) and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Only UIL Officers can invite students to cohorts.")

        from apps.teams.models import InHouseCohort
        from apps.uil_profiles.models import UILStudentProfile
        cohort = generics.get_object_or_404(InHouseCohort, id=cohort_id)

        student_id = request.data.get("student_id")
        if not student_id:
            return Response({"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        student = generics.get_object_or_404(UILStudentProfile, id=student_id)

        # Enforce university match between UIL Officer and Student
        if role_upper == User.Role.UIL_OFFICER:
            from apps.uil_profiles.utils import get_user_university, get_student_profile_university, universities_match
            uil_univ = get_user_university(user)
            student_univ = get_student_profile_university(student)
            if uil_univ and not universities_match(student_univ, uil_univ):
                return Response(
                    {"detail": f"Institutional Mismatch: You can only invite students from your university ({uil_univ}). Student belongs to '{student_univ}'."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Enforce: only students verified by Department Dean can be invited
        if not student.is_verified_by_dean:
            return Response(
                {"detail": "Student has not been verified by Department Dean yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce minimum GPA if configured on cohort
        if cohort.min_gpa and student.gpa and student.gpa < cohort.min_gpa:
            return Response(
                {"detail": f"Student GPA ({student.gpa}) does not satisfy cohort minimum requirement ({cohort.min_gpa})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Enforce capacity K
        total_count = cohort.enrolled_count + cohort.invited_students.count()
        if total_count >= cohort.capacity_k and not cohort.invited_students.filter(id=student.id).exists():
            return Response(
                {"detail": f"Cohort capacity K ({cohort.capacity_k}) has been reached."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cohort.invited_students.add(student)

        # Dispatch notification to student's bell
        student_user = getattr(student, "user", None)
        if not student_user and hasattr(student, "student"):
            student_user = getattr(student.student, "user", None)
        if student_user:
            from apps.notifications.services import create_notification
            from apps.notifications.models import Notification
            create_notification(
                recipient=student_user,
                actor=request.user,
                title="Track 1 Software House Cohort Invitation",
                message=f"You have been invited by UIL Officer to join the in-house cohort '{cohort.title or cohort.university_name}'. Review academic prerequisites and accept placement.",
                notification_type=Notification.NotificationType.COHORT,
                link="/student/dashboard?tab=track1",
                metadata={"cohort_id": str(cohort.id), "action": "INVITE"},
            )

        return Response({
            "message": f"Student {student.student_id_number} invited to {cohort.title or cohort.university_name}.",
            "cohort_id": str(cohort.id),
            "invited_count": cohort.invited_students.count(),
            "enrolled_count": cohort.enrolled_count,
            "capacity_k": cohort.capacity_k,
        }, status=status.HTTP_200_OK)


class StudentCohortAcceptView(APIView):
    """
    POST /api/v1/projects/cohorts/<uuid:cohort_id>/accept/
    Student 1-click accepts cohort enrollment directly on their dashboard.
    Dispatches in-app notification to the UIL Officer's notification bell.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, cohort_id):
        from apps.teams.models import InHouseCohort
        from apps.uil_profiles.models import UILStudentProfile
        from apps.logistics.models import CampusLogistics
        cohort = generics.get_object_or_404(InHouseCohort, id=cohort_id)

        uil_profile = UILStudentProfile.objects.filter(student__user=request.user).first()
        if not uil_profile:
            return Response({"detail": "UIL Student Profile not found."}, status=status.HTTP_400_BAD_REQUEST)

        if not uil_profile.is_verified_by_dean:
            return Response({"detail": "You must be verified by your Department Dean before joining a cohort."}, status=status.HTTP_400_BAD_REQUEST)

        # Enroll student
        if not cohort.accepted_students.filter(id=uil_profile.id).exists():
            cohort.accepted_students.add(uil_profile)
            cohort.invited_students.remove(uil_profile)
            cohort.enrolled_count = cohort.accepted_students.count()
            cohort.save()

            # Ensure CampusLogistics is updated
            logistics, _ = CampusLogistics.objects.get_or_create(
                student=uil_profile,
                defaults={"cohort": cohort},
            )
            logistics.cohort = cohort
            logistics.uil_placed = True
            logistics.uil_placed_at = timezone.now()
            logistics.save()

            # Send in-app notification to UIL Officer
            from apps.notifications.services import create_notification
            from apps.notifications.models import Notification
            student_user = request.user
            student_name = f"{student_user.first_name} {student_user.last_name}".strip() or student_user.username
            from apps.uil_profiles.utils import get_student_profile_university, universities_match, get_user_university
            student_univ = get_student_profile_university(uil_profile)
            uil_officers = User.objects.filter(role=User.Role.UIL_OFFICER)
            for uil in uil_officers:
                uil_univ = get_user_university(uil)
                if not student_univ or not uil_univ or universities_match(student_univ, uil_univ):
                    create_notification(
                        recipient=uil,
                        actor=student_user,
                        title=f"Cohort Enrollment: {student_name} Accepted",
                        message=f"Student {student_name} ({uil_profile.student_id_number}) has accepted enrollment in cohort '{cohort.title or cohort.university_name}'.",
                        notification_type=Notification.NotificationType.COHORT,
                        link="/uil/dashboard?tab=cohorts",
                        metadata={"cohort_id": str(cohort.id), "student_id": str(uil_profile.id), "action": "ACCEPT"},
                    )

        return Response({
            "message": f"Successfully enrolled in cohort: {cohort.title or cohort.university_name}!",
            "cohort_id": str(cohort.id),
            "enrolled_count": cohort.enrolled_count,
        }, status=status.HTTP_200_OK)


class StudentCohortRejectView(APIView):
    """
    POST /api/v1/projects/cohorts/<uuid:cohort_id>/reject/
    Student declines/rejects an in-house cohort invitation.
    Removes the student from invited_students and notifies institutional UIL Officer.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, cohort_id):
        from apps.teams.models import InHouseCohort
        from apps.uil_profiles.models import UILStudentProfile
        from apps.notifications.services import create_notification
        from apps.notifications.models import Notification

        cohort = generics.get_object_or_404(InHouseCohort, id=cohort_id)
        uil_profile = UILStudentProfile.objects.filter(student__user=request.user).first()
        if not uil_profile:
            return Response({"detail": "UIL Student Profile not found."}, status=status.HTTP_400_BAD_REQUEST)

        # Remove from invited students if present
        cohort.invited_students.remove(uil_profile)

        # Send in-app notification to UIL Officer
        student_user = request.user
        student_name = f"{student_user.first_name} {student_user.last_name}".strip() or student_user.username

        from apps.uil_profiles.utils import get_student_profile_university, universities_match, get_user_university
        student_univ = get_student_profile_university(uil_profile)
        uil_officers = User.objects.filter(role=User.Role.UIL_OFFICER)

        for uil in uil_officers:
            uil_univ = get_user_university(uil)
            if not student_univ or not uil_univ or universities_match(student_univ, uil_univ):
                create_notification(
                    recipient=uil,
                    actor=student_user,
                    title=f"Cohort Invitation Declined by {student_name}",
                    message=f"Student {student_name} ({uil_profile.student_id_number}) has declined the invitation to join cohort '{cohort.title or cohort.university_name}'.",
                    notification_type=Notification.NotificationType.COHORT,
                    link="/uil/dashboard?tab=cohorts",
                    metadata={"cohort_id": str(cohort.id), "student_id": str(uil_profile.id), "action": "REJECT"},
                )

        return Response({
            "message": f"You have declined the invitation for cohort: {cohort.title or cohort.university_name}.",
            "cohort_id": str(cohort.id),
        }, status=status.HTTP_200_OK)


class StudentMyCohortsView(APIView):
    """
    GET /api/v1/projects/cohorts/my-cohorts/
    Returns cohorts where student is invited, enrolled, or eligible to join.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.teams.models import InHouseCohort
        from apps.uil_profiles.models import UILStudentProfile
        uil_profile = UILStudentProfile.objects.filter(student__user=request.user).first()

        cohorts = InHouseCohort.objects.filter(is_open=True).order_by("-created_at")
        results = []
        for c in cohorts:
            is_invited = uil_profile in c.invited_students.all() if uil_profile else False
            is_enrolled = uil_profile in c.accepted_students.all() if uil_profile else False
            results.append({
                "id": str(c.id),
                "title": c.title or f"{c.university_name} Cohort",
                "university_name": c.university_name,
                "department": c.department or "All Engineering",
                "requirements": c.requirements,
                "opportunities": c.opportunities,
                "min_gpa": str(c.min_gpa) if c.min_gpa else None,
                "academic_year": c.academic_year,
                "start_date": str(c.start_date),
                "end_date": str(c.end_date),
                "capacity_k": c.capacity_k,
                "enrolled_count": c.enrolled_count,
                "is_open": c.is_open,
                "is_invited": is_invited,
                "is_enrolled": is_enrolled,
            })

        return Response({"cohorts": results}, status=status.HTTP_200_OK)


class ProjectTeamMessageListCreateView(generics.ListCreateAPIView):
    """
    GET: List communication messages for a team in chronological order.
    POST: Send a message to the team's communication channel.
    """
    serializer_class = ProjectTeamMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        team_id = self.kwargs.get("team_id")
        return ProjectTeamMessage.objects.filter(team_id=team_id).select_related("sender").order_by("created_at")

    def perform_create(self, serializer):
        team_id = self.kwargs.get("team_id")
        team = generics.get_object_or_404(ProjectTeam, id=team_id)
        serializer.save(team=team, sender=self.request.user)


class MyTeamChannelView(generics.GenericAPIView):
    """
    GET: Resolves the student's active squad channel or advisor's supervised squads
    and returns the team info and recent messages.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        role_upper = str(getattr(user, "role", "")).upper()

        team = None
        if role_upper == User.Role.STUDENT:
            membership = TeamMember.objects.filter(student__user=user).select_related("team", "team__assigned_advisor").first()
            if membership and membership.team:
                team = membership.team
        elif role_upper == User.Role.ADVISOR:
            team = ProjectTeam.objects.filter(assigned_advisor=user).first()
            if not team:
                team = ProjectTeam.objects.first()
        else:
            team = ProjectTeam.objects.first()

        if not team:
            return Response(
                {"team": None, "messages": []},
                status=status.HTTP_200_OK,
            )

        messages = team.messages.select_related("sender").order_by("created_at")
        return Response(
            {
                "team": ProjectTeamSerializer(team).data,
                "messages": ProjectTeamMessageSerializer(messages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


