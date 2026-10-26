from django.urls import path
from apps.teams.views import (
    CohortBalanceTeamsView,
    SRSReviewView,
    WeeklyLogbookListCreateView,
    ProjectTeamDetailView,
    ProjectTeamListView,
    UILProgramListCreateView,
    UILProgramAssignStudentsView,
    ProjectTeamDocumentationSubmitView,
    ProjectTeamDocumentationReviewView,
    ProjectTeamImplementationSubmitView,
    AdvisorVerifyImplementationView,
    UILScoreAndSealView,
    TeamChannelMessageListView,
    TeamChannelMessageSendView,
)

app_name = "teams"

urlpatterns = [
    path("", ProjectTeamListView.as_view(), name="team-list"),
    path("programs/", UILProgramListCreateView.as_view(), name="program-list-create"),
    path("programs/<uuid:pk>/assign-students/", UILProgramAssignStudentsView.as_view(), name="program-assign-students"),
    path("cohorts/<uuid:cohort_id>/balance/", CohortBalanceTeamsView.as_view(), name="cohort-balance"),
    path("<uuid:team_id>/srs/review/", SRSReviewView.as_view(), name="team-srs-review"),
    path("srs/<uuid:team_id>/review/", SRSReviewView.as_view(), name="srs-review-alt"),
    path("logbooks/", WeeklyLogbookListCreateView.as_view(), name="logbook-list-create"),
    path("<uuid:team_id>/submit-documentation/", ProjectTeamDocumentationSubmitView.as_view(), name="team-submit-documentation"),
    path("<uuid:team_id>/review-documentation/", ProjectTeamDocumentationReviewView.as_view(), name="team-review-documentation"),
    path("<uuid:team_id>/submit-implementation/", ProjectTeamImplementationSubmitView.as_view(), name="team-submit-implementation"),
    path("<uuid:team_id>/advisor-verify/", AdvisorVerifyImplementationView.as_view(), name="team-advisor-verify"),
    path("<uuid:team_id>/uil-score-seal/", UILScoreAndSealView.as_view(), name="team-uil-score-seal"),
    path("<uuid:team_id>/messages/", TeamChannelMessageListView.as_view(), name="team-messages-list"),
    path("<uuid:team_id>/messages/send/", TeamChannelMessageSendView.as_view(), name="team-messages-send"),
    path("<uuid:pk>/", ProjectTeamDetailView.as_view(), name="team-detail"),
]
