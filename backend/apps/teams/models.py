import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone


class InHouseCohort(models.Model):
    """
    University In-House Software House Cohort.
    Tracks academic year, duration, capacity K, enrolled student count, and status.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    university_name = models.CharField(
        max_length=255,
        verbose_name="University Name",
        help_text="Name of the university hosting the in-house cohort.",
    )
    academic_year = models.CharField(
        max_length=50,
        verbose_name="Academic Year",
        help_text="Academic year for this cohort (e.g. '2023/2024' or '4').",
    )
    start_date = models.DateField(
        verbose_name="Start Date",
        help_text="Start date of the in-house software house cohort.",
    )
    end_date = models.DateField(
        verbose_name="End Date",
        help_text="End date of the in-house software house cohort.",
    )
    capacity_k = models.PositiveIntegerField(
        verbose_name="Cohort Capacity (K)",
        help_text="Target capacity K of accepted students.",
    )
    enrolled_count = models.PositiveIntegerField(
        default=0,
        verbose_name="Enrolled Student Count",
        help_text="Current number of students accepted and enrolled.",
    )
    is_open = models.BooleanField(
        default=True,
        verbose_name="Is Open",
        help_text="Whether this cohort is actively accepting applications or open for team formation.",
    )
    title = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Cohort Title",
    )
    department = models.CharField(
        max_length=128,
        blank=True,
        default="",
        verbose_name="Target Department",
    )
    requirements = models.TextField(
        blank=True,
        default="",
        verbose_name="Cohort Requirements",
    )
    opportunities = models.TextField(
        blank=True,
        default="",
        verbose_name="Opportunities Offered",
    )
    min_gpa = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        null=True,
        blank=True,
        default=Decimal("2.50"),
        verbose_name="Minimum GPA Requirement",
    )
    accepted_students = models.ManyToManyField(
        "uil_profiles.UILStudentProfile",
        related_name="inhouse_cohorts",
        blank=True,
        verbose_name="Accepted Student Profiles",
    )
    invited_students = models.ManyToManyField(
        "uil_profiles.UILStudentProfile",
        related_name="invited_inhouse_cohorts",
        blank=True,
        verbose_name="Invited Student Profiles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "In-House Cohort"
        verbose_name_plural = "In-House Cohorts"
        ordering = ["-start_date", "university_name"]

    def __str__(self):
        return f"{self.university_name} - Year {self.academic_year} (Capacity: {self.capacity_k})"


class InternshipProgram(models.Model):
    """
    University-Industry Linkage (UIL) Internship Program.
    Tracks institutional quotas, active programs, and student enrollments.
    """
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    cohort = models.ForeignKey(
        InHouseCohort,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="programs",
        verbose_name="In-House Cohort",
    )
    name = models.CharField(
        max_length=255,
        verbose_name="Program Name",
    )
    description = models.TextField(
        blank=True,
        default="",
        verbose_name="Program Description",
    )
    target_quota = models.PositiveIntegerField(
        default=50,
        verbose_name="Target Student Quota",
    )
    enrolled_count = models.PositiveIntegerField(
        default=0,
        verbose_name="Enrolled Count",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Internship Program"
        verbose_name_plural = "Internship Programs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} (Quota: {self.enrolled_count}/{self.target_quota})"


class ProjectTeam(models.Model):
    """
    University In-House Software House Project Team / Squad.
    Enforces the Documentation Gate: srs_status must be 'APPROVED'
    before coding-phase actions (weekly logbook submissions, sprint commits) unlock.
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
        InHouseCohort,
        on_delete=models.CASCADE,
        related_name="teams",
        verbose_name="In-House Cohort",
    )
    team_name = models.CharField(
        max_length=255,
        verbose_name="Team Name",
        help_text="Designation for this squad (e.g. 'Squad 1', 'Frontend Core').",
    )
    project_title = models.CharField(
        max_length=255,
        verbose_name="Project Title",
        help_text="Assigned software house project title.",
    )
    assigned_advisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teams_supervised",
        verbose_name="Academic Advisor",
        help_text="Institutional Academic Advisor assigned to supervise this squad.",
    )
    srs_document = models.FileField(
        upload_to="srs_documents/%Y/%m/",
        null=True,
        blank=True,
        verbose_name="Software Requirements Specification (SRS)",
    )
    srs_status = models.CharField(
        max_length=20,
        choices=SRSStatus.choices,
        default=SRSStatus.DRAFT,
        db_index=True,
        verbose_name="SRS Review Status",
    )
    srs_feedback = models.TextField(
        blank=True,
        default="",
        verbose_name="Advisor SRS Feedback",
        help_text="Feedback and revision guidance provided by the academic advisor.",
    )
    srs_revision_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Revision Deadline",
        help_text="2-week revision deadline opened when an SRS is rejected.",
    )
    channels_active = models.BooleanField(
        default=True,
        verbose_name="Channels Active",
        help_text="Whether squad messaging and collaboration channels are active.",
    )

    # Track 1 Documentation & Implementation Countdown Deadlines
    documentation_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Documentation Submission Deadline",
    )
    implementation_deadline = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Implementation Submission Deadline",
    )
    documentation_submission = models.FileField(
        upload_to="squad_docs/%Y/%m/",
        null=True,
        blank=True,
        verbose_name="Documentation Submission File",
    )
    documentation_submitted_at = models.DateTimeField(null=True, blank=True)

    implementation_submission = models.FileField(
        upload_to="squad_impl/%Y/%m/",
        null=True,
        blank=True,
        verbose_name="Implementation Submission File",
    )
    implementation_repo_url = models.URLField(
        blank=True,
        default="",
        verbose_name="Implementation Git Repo URL",
    )
    implementation_submitted_at = models.DateTimeField(null=True, blank=True)

    # Advisor Verification & Ratings
    implementation_verified_by_advisor = models.BooleanField(
        default=False,
        verbose_name="Implementation Verified by Advisor",
    )
    advisor_verification_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="Advisor Implementation Notes",
    )
    advisor_rating = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Advisor Rating",
    )
    advisor_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Advisor Score (out of 25)",
    )

    # UIL Scoring & QR Seal
    uil_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="UIL Score (out of 25)",
    )
    uil_score_sealed = models.BooleanField(
        default=False,
        verbose_name="UIL Score Sealed",
    )
    uil_score_sheet_qr = models.TextField(
        blank=True,
        default="",
        verbose_name="UIL Score Sheet Base64 QR",
    )

    # Dean Composite Grading (Advisor 25% + UIL 25% + Doc 25% + Pres 25% = 100%)
    documentation_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Documentation Score (out of 25)",
    )
    presentation_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Presentation Score (out of 25)",
    )
    final_composite_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Final Composite Score (out of 100)",
    )
    final_grade_letter = models.CharField(
        max_length=5,
        blank=True,
        default="",
        verbose_name="Final Letter Grade",
    )
    is_unsealed_by_dean = models.BooleanField(
        default=False,
        verbose_name="Unsealed by Dean",
    )

    # Defense Scheduling & Meet
    defense_scheduled_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Scheduled Final Defense",
    )
    defense_venue = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="Defense Venue",
    )
    google_meet_url = models.URLField(
        blank=True,
        default="",
        verbose_name="Google Meet Link",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Project Team"
        verbose_name_plural = "Project Teams"
        ordering = ["cohort", "team_name"]

    def __str__(self):
        return f"{self.team_name} - {self.project_title} [{self.srs_status}]"

    def approve_srs(self, feedback=""):
        """Unlock the documentation gate, allowing weekly logbook submissions."""
        self.srs_status = self.SRSStatus.APPROVED
        if feedback:
            self.srs_feedback = feedback
        self.srs_revision_deadline = None
        self.save(update_fields=["srs_status", "srs_feedback", "srs_revision_deadline", "updated_at"])

    def reject_srs(self, feedback="", revision_days=14):
        """Reject SRS, record advisor feedback, and open a 2-week revision deadline."""
        self.srs_status = self.SRSStatus.REJECTED
        self.srs_feedback = feedback
        self.srs_revision_deadline = timezone.now() + timezone.timedelta(days=revision_days)
        self.save(update_fields=["srs_status", "srs_feedback", "srs_revision_deadline", "updated_at"])

    @property
    def is_coding_unlocked(self) -> bool:
        """Returns True if the Documentation Gate has been cleared."""
        return self.srs_status == self.SRSStatus.APPROVED

    @property
    def leader(self):
        """Returns the UILStudentProfile designated as the leader of this squad."""
        member = self.members.filter(is_leader=True).first()
        return member.student if member else None

    def compute_composite_grade(self):
        adv = Decimal(str(self.advisor_score)) if self.advisor_score is not None else Decimal("0")
        uil = Decimal(str(self.uil_score)) if self.uil_score is not None else Decimal("0")
        doc = Decimal(str(self.documentation_score)) if self.documentation_score is not None else Decimal("0")
        pres = Decimal(str(self.presentation_score)) if self.presentation_score is not None else Decimal("0")
        total = adv + uil + doc + pres
        self.final_composite_score = min(total, Decimal("100.0"))
        if total >= 90:
            self.final_grade_letter = "A+"
        elif total >= 85:
            self.final_grade_letter = "A"
        elif total >= 80:
            self.final_grade_letter = "A-"
        elif total >= 75:
            self.final_grade_letter = "B+"
        elif total >= 70:
            self.final_grade_letter = "B"
        elif total >= 65:
            self.final_grade_letter = "C+"
        elif total >= 60:
            self.final_grade_letter = "C"
        else:
            self.final_grade_letter = "F"
        return self.final_composite_score, self.final_grade_letter



class TeamMember(models.Model):
    """
    Membership record mapping a UILStudentProfile into a ProjectTeam squad.
    Designates role archetype (Frontend, Backend, DevOps) and leadership.
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
        verbose_name="Project Team",
    )
    student = models.ForeignKey(
        "uil_profiles.UILStudentProfile",
        on_delete=models.CASCADE,
        related_name="team_memberships",
        verbose_name="UIL Student Profile",
    )
    is_leader = models.BooleanField(
        default=False,
        verbose_name="Is Team Leader",
    )
    role = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name="Assigned Technical Role",
        help_text="Assigned squad archetype (e.g. 'Frontend/Mobile', 'Backend/API', 'DevOps/QA').",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Team Member"
        verbose_name_plural = "Team Members"
        ordering = ["-is_leader", "created_at"]
        unique_together = [("team", "student")]

    def __str__(self):
        leader_suffix = " (Leader)" if self.is_leader else ""
        return f"{self.student.student_id_number} in {self.team.team_name} [{self.role}]{leader_suffix}"


class WeeklyLogbook(models.Model):
    """
    Weekly logbook submitted by an intern detailing tasks planned,
    tasks executed, challenges encountered, and git commits.
    Screened automatically for academic integrity / plagiarism.
    Protected by the SRS Documentation Gate.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    team = models.ForeignKey(
        ProjectTeam,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logbooks",
        verbose_name="Project Team",
    )
    student = models.ForeignKey(
        "uil_profiles.UILStudentProfile",
        on_delete=models.CASCADE,
        related_name="weekly_logbooks",
        verbose_name="UIL Student Profile",
    )
    academic_advisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teams_supervised_logbooks",
        verbose_name="Academic Advisor",
    )
    company_mentor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teams_mentored_logbooks",
        verbose_name="Company Mentor",
    )
    week_number = models.PositiveIntegerField(
        verbose_name="Week Number",
        help_text="Internship week number (1 to 16).",
    )
    tasks_planned = models.TextField(
        blank=True,
        default="",
        verbose_name="Tasks Planned",
    )
    tasks_executed = models.TextField(
        blank=True,
        default="",
        verbose_name="Tasks Executed",
    )
    challenges_faced = models.TextField(
        blank=True,
        default="",
        verbose_name="Challenges Faced",
    )
    git_commit_urls = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Git Commit / PR URLs",
    )
    similarity_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.0"),
        verbose_name="Plagiarism Similarity Score (%)",
    )
    is_flagged = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Plagiarism Flagged",
    )
    matched_snippet = models.TextField(
        blank=True,
        default="",
        verbose_name="Matched Historical Passage",
    )
    advisor_approved = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Advisor Approved",
    )
    advisor_feedback = models.TextField(
        blank=True,
        default="",
        verbose_name="Advisor Feedback",
    )
    submitted_at = models.DateTimeField(
        default=timezone.now,
        verbose_name="Submission Timestamp",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Weekly Logbook"
        verbose_name_plural = "Weekly Logbooks"
        ordering = ["-week_number", "-submitted_at"]

    def __str__(self):
        return f"Week {self.week_number} Logbook - {self.student.student_id_number} (Flagged: {self.is_flagged})"


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
        related_name="teams_logbook_alerts",
    )
    alert_type = models.CharField(
        max_length=50,
        choices=AlertType.choices,
        default=AlertType.PLAGIARISM_FLAGGED,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Logbook Alert"
        verbose_name_plural = "Logbook Alerts"

    def __str__(self):
        return f"Alert: {self.title} -> {self.recipient.email}"


class TeamChannelMessage(models.Model):
    """
    Track 1 multi-channel communication system supporting:
    - SQUAD_INTERNAL: Internal squad member collaboration
    - SQUAD_UIL: Squad communicating with UIL Officer
    - SQUAD_ADVISOR: Squad communicating with Academic Advisor (includes Google Meet link)
    - STUDENT_COMPANY: Direct chat between Student and Company HR after invite accept
    - STUDENT_DEAN: Student communicating with Department Dean
    """
    class ChannelType(models.TextChoices):
        SQUAD_INTERNAL = "SQUAD_INTERNAL", "Squad Internal"
        SQUAD_UIL = "SQUAD_UIL", "Squad + UIL Officer"
        SQUAD_ADVISOR = "SQUAD_ADVISOR", "Squad + Academic Advisor"
        STUDENT_COMPANY = "STUDENT_COMPANY", "Student + Company Direct"
        STUDENT_DEAN = "STUDENT_DEAN", "Student + Department Dean Direct"
        STUDENT_UIL = "STUDENT_UIL", "Student + UIL Officer Direct"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    team = models.ForeignKey(
        ProjectTeam,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="channel_messages",
    )
    channel_type = models.CharField(
        max_length=30,
        choices=ChannelType.choices,
        default=ChannelType.SQUAD_INTERNAL,
        db_index=True,
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_channel_messages",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_direct_messages",
    )
    message = models.TextField()
    meet_url = models.URLField(
        blank=True,
        default="",
        verbose_name="Google Meet URL",
    )
    attachment = models.FileField(
        upload_to="channel_attachments/%Y/%m/",
        null=True,
        blank=True,
    )
    is_read = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Is Read / Seen",
    )
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Read At Timestamp",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Channel Message"
        verbose_name_plural = "Channel Messages"

    def __str__(self):
        return f"[{self.channel_type}] {self.sender.email}: {self.message[:30]}"

