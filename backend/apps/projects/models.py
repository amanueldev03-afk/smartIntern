import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


class ProjectTeam(models.Model):
    """
    University In-House Software House project team / squad (Track 1).
    Enforces the Documentation Gate: srs_status must be 'APPROVED'
    before coding-phase actions (git commits, weekly sprint logs) unlock.
    """

    class SRSStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    cohort = models.ForeignKey(
        "universities.InHouseCohort",
        on_delete=models.CASCADE,
        related_name="teams",
        help_text="The in-house cohort to which this project team belongs.",
    )

    team_name = models.CharField(
        max_length=255,
        help_text="Name of the project squad (e.g. 'Squad 1').",
    )

    project_title = models.CharField(
        max_length=255,
        help_text="Assigned project title for this team.",
    )

    assigned_advisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advised_teams",
        limit_choices_to={"role": "ADVISOR"},
        help_text="Institutional Academic Advisor assigned to supervise this squad.",
    )

    srs_document = models.FileField(
        upload_to="srs_documents/",
        null=True,
        blank=True,
        help_text="Uploaded Software Requirements Specification (SRS) PDF document.",
    )

    srs_status = models.CharField(
        max_length=20,
        choices=SRSStatus.choices,
        default=SRSStatus.DRAFT,
        db_index=True,
        help_text="Current review status of the team's SRS document.",
    )

    srs_feedback = models.TextField(
        blank=True,
        default="",
        help_text="Advisor feedback notes and revision requirements for the SRS.",
    )

    srs_revision_deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Two-week revision deadline opened when an SRS is rejected.",
    )

    channels_active = models.BooleanField(
        default=True,
        help_text="Whether squad communication channels are currently active.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["cohort", "team_name"]
        verbose_name = "Project Team"
        verbose_name_plural = "Project Teams"

    def __str__(self):
        return f"{self.team_name} - {self.project_title} ({self.srs_status})"

    def approve_srs(self, feedback=""):
        """Unlock coding phase and sprint board."""
        self.srs_status = self.SRSStatus.APPROVED
        if feedback:
            self.srs_feedback = feedback
        self.srs_revision_deadline = None
        self.save()

    def reject_srs(self, feedback="", revision_days=14):
        """Reject SRS and open a 2-week revision deadline with advisor feedback notes."""
        self.srs_status = self.SRSStatus.REJECTED
        self.srs_feedback = feedback
        self.srs_revision_deadline = timezone.now() + timezone.timedelta(days=revision_days)
        self.save()

    @property
    def is_coding_unlocked(self):
        """Returns True if SRS has been approved by the advisor."""
        return self.srs_status == self.SRSStatus.APPROVED

    @property
    def leader(self):
        leader_member = self.members.filter(is_leader=True).first()
        return leader_member.student if leader_member else None


class TeamMember(models.Model):
    """
    Mapping between a student profile and their assigned project team / squad.
    Designates the team leader and specific technical role within the squad.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    team = models.ForeignKey(
        ProjectTeam,
        on_delete=models.CASCADE,
        related_name="members",
        help_text="The project squad this student belongs to.",
    )

    student = models.ForeignKey(
        "accounts.StudentProfile",
        on_delete=models.CASCADE,
        related_name="team_memberships",
        help_text="The enrolled student profile.",
    )

    is_leader = models.BooleanField(
        default=False,
        help_text="Whether this student is designated as the squad leader.",
    )

    assigned_role = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Assigned technical role (e.g. 'Frontend Developer', 'Backend Developer', 'DevOps / QA Specialist').",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_leader", "created_at"]
        verbose_name = "Team Member"
        verbose_name_plural = "Team Members"
        unique_together = [("team", "student")]

    def __str__(self):
        role_label = " (Leader)" if self.is_leader else ""
        return f"{self.student} in {self.team.team_name}{role_label}"


class WeeklyLogbook(models.Model):
    """
    Weekly logbook submitted by an intern detailing tasks planned,
    tasks executed, challenges encountered, and git commits.
    Screened automatically for academic integrity / plagiarism.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    project_team = models.ForeignKey(
        ProjectTeam,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logbooks",
        help_text="Associated in-house project team (Track 1).",
    )

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="weekly_logbooks",
        help_text="The student intern who authored this weekly logbook.",
    )

    academic_advisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_logbooks",
        help_text="Institutional Academic Advisor supervising this student.",
    )

    company_mentor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mentored_logbooks",
        help_text="Industry mentor guiding the student during the internship.",
    )

    week_number = models.PositiveIntegerField(
        help_text="The internship week number (e.g. 1 through 16).",
    )

    tasks_planned = models.TextField(
        blank=True,
        default="",
        help_text="Objectives and tasks planned for this week.",
    )

    tasks_executed = models.TextField(
        blank=True,
        default="",
        help_text="Actual work completed, implementations, and modules built.",
    )

    challenges_faced = models.TextField(
        blank=True,
        default="",
        help_text="Technical roadblocks, debugging hurdles, or institutional challenges.",
    )

    git_commit_urls = models.JSONField(
        default=list,
        blank=True,
        help_text="List of GitHub/GitLab commit, PR, or repository URLs verifying execution.",
    )

    # Plagiarism / Academic Integrity Screening
    similarity_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.0"),
        help_text="Highest cosine similarity percentage (0.0 to 100.0) against historical logbooks.",
    )

    is_flagged = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True if similarity score >= 75.0% indicating potential plagiarism.",
    )

    matched_snippet = models.TextField(
        blank=True,
        default="",
        help_text="Snippet of the closest matching historical logbook text.",
    )

    # Advisor Review & Feedback
    advisor_approved = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Approved by institutional academic advisor.",
    )

    advisor_feedback = models.TextField(
        blank=True,
        default="",
        help_text="Qualitative feedback, critique, or grading notes from the advisor.",
    )

    submitted_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the logbook was submitted for evaluation.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-week_number", "-submitted_at"]
        verbose_name = "Weekly Logbook"
        verbose_name_plural = "Weekly Logbooks"

    def __str__(self):
        return f"Week {self.week_number} Logbook - {self.student} (Flagged: {self.is_flagged})"

    def clean(self):
        # Resolve StudentProfile to User instance if passed
        if hasattr(self.student, "user") and not hasattr(self.student, "is_authenticated"):
            self.student = self.student.user

    @property
    def student_profile(self):
        from apps.students.models import StudentProfile
        return StudentProfile.objects.filter(user=self.student).first()


class LogbookAlert(models.Model):
    """
    In-app alert dispatched when a weekly logbook is flagged for plagiarism
    or requires supervisor review.
    """

    class AlertType(models.TextChoices):
        PLAGIARISM_FLAGGED = "plagiarism_flagged", "Plagiarism Flagged"
        ADVISOR_REVIEW = "advisor_review", "Advisor Review"
        MENTOR_REVIEW = "mentor_review", "Mentor Review"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    logbook = models.ForeignKey(
        WeeklyLogbook,
        on_delete=models.CASCADE,
        related_name="alerts",
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="logbook_alerts",
    )

    alert_type = models.CharField(
        max_length=50,
        choices=AlertType.choices,
        default=AlertType.PLAGIARISM_FLAGGED,
    )

    title = models.CharField(max_length=255)
    message = models.TextField()

    is_read = models.BooleanField(
        default=False,
        db_index=True,
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Logbook Alert"
        verbose_name_plural = "Logbook Alerts"

    def __str__(self):
        return f"Alert: {self.title} -> {self.recipient.email} (Read: {self.is_read})"


class ProjectTeamMessage(models.Model):
    """
    Two-way communication channel message between student squads and their institutional academic advisor.
    Supports general team discussion, SRS documentation feedback, advisory notices, and sprint updates.
    """

    class MessageType(models.TextChoices):
        GENERAL = "GENERAL", "General Discussion"
        SRS_FEEDBACK = "SRS_FEEDBACK", "SRS Documentation Feedback"
        ADVISORY_NOTICE = "ADVISORY_NOTICE", "Advisory Notice"
        SPRINT_UPDATE = "SPRINT_UPDATE", "Sprint Progress Update"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    team = models.ForeignKey(
        ProjectTeam,
        on_delete=models.CASCADE,
        related_name="messages",
        help_text="The project team this communication message belongs to.",
    )

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_messages",
        help_text="The user (student, advisor, mentor, admin) who sent this message.",
    )

    message = models.TextField(
        help_text="The content of the message.",
    )

    message_type = models.CharField(
        max_length=32,
        choices=MessageType.choices,
        default=MessageType.GENERAL,
        db_index=True,
        help_text="Category of the communication.",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Project Team Message"
        verbose_name_plural = "Project Team Messages"

    def __str__(self):
        return f"[{self.message_type}] {self.sender.email} on {self.team.team_name}: {self.message[:30]}..."

