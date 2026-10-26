from django.db import models

from apps.common.models import TimeStampedModel


class Company(TimeStampedModel):
    """
    Organisation that publishes internships (Section 3.6).

    Listings belong to a company; collection from career pages still
    goes through DataSource. One Company has many Internships.
    """

    name = models.CharField(
        max_length=300,
        unique=True,
        db_index=True,
    )

    website = models.URLField(
        blank=True,
    )

    country = models.CharField(
        max_length=100,
        blank=True,
    )

    industry = models.CharField(
        max_length=150,
        blank=True,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Company"
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name


class CompanyProfile(TimeStampedModel):
    """
    Institutional company profile extension (Phase 11).
    Links to Company and stores corporate identity and verified contact details.
    """

    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name="profile",
        null=True,
        blank=True,
        verbose_name="Associated Company",
    )
    tin_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        verbose_name="Tax Identification Number (TIN)",
    )
    contact_person = models.CharField(
        max_length=150,
        blank=True,
        default="",
        verbose_name="Primary Contact Person",
    )
    contact_email = models.EmailField(
        blank=True,
        default="",
        verbose_name="Primary Contact Email",
    )
    contact_phone = models.CharField(
        max_length=30,
        blank=True,
        default="",
        verbose_name="Primary Contact Phone",
    )
    is_verified = models.BooleanField(
        default=False,
        verbose_name="Institutional Verification Status",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Company Profile"
        verbose_name_plural = "Company Profiles"

    def __str__(self):
        if self.company:
            return f"CompanyProfile({self.company.name})"
        return f"CompanyProfile({self.contact_person or self.id})"


import uuid


class CompanyStudentInvitation(models.Model):
    """
    Direct employer invitation sent to a qualified student based on AI matching.
    When accepted, triggers a direct communication channel between student and company.
    """
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    internship = models.ForeignKey(
        "internships.Internship",
        on_delete=models.CASCADE,
        related_name="student_invitations",
    )
    student = models.ForeignKey(
        "uil_profiles.UILStudentProfile",
        on_delete=models.CASCADE,
        related_name="company_invitations",
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="sent_student_invitations",
        null=True,
        blank=True,
    )
    requirements_note = models.TextField(
        blank=True,
        default="",
        verbose_name="Invitation Requirements & Notes",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Company Student Invitation"
        verbose_name_plural = "Company Student Invitations"

    def __str__(self):
        return f"Invite for {self.student.student_id_number} to {self.internship.title} [{self.status}]"

