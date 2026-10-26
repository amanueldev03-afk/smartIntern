from django.contrib import admin
from .models import WeeklyLogbook, LogbookAlert, ProjectTeam, TeamMember


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0


@admin.register(ProjectTeam)
class ProjectTeamAdmin(admin.ModelAdmin):
    list_display = (
        "team_name",
        "project_title",
        "cohort",
        "assigned_advisor",
        "srs_status",
        "channels_active",
        "created_at",
    )
    list_filter = ("srs_status", "cohort", "channels_active")
    search_fields = ("team_name", "project_title")
    inlines = [TeamMemberInline]


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("student", "team", "is_leader", "assigned_role", "created_at")
    list_filter = ("is_leader", "assigned_role")
    search_fields = ("student__student_id_number", "student__user__email", "team__team_name")


@admin.register(WeeklyLogbook)
class WeeklyLogbookAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "week_number",
        "academic_advisor",
        "company_mentor",
        "similarity_score",
        "is_flagged",
        "advisor_approved",
        "submitted_at",
    )
    list_filter = ("is_flagged", "advisor_approved", "week_number")
    search_fields = ("student__email", "tasks_planned", "tasks_executed")


@admin.register(LogbookAlert)
class LogbookAlertAdmin(admin.ModelAdmin):
    list_display = ("title", "recipient", "alert_type", "is_read", "created_at")
    list_filter = ("alert_type", "is_read")
    search_fields = ("title", "message", "recipient__email")
