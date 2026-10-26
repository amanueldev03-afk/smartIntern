from django.urls import path
from apps.uil_profiles.views import (
    ResumeUploadView,
    ResumeStatusView,
    ResumeConfirmView,
    DeanStudentListView,
    DeanVerifyStudentView,
    DeanIssueLetterView,
    StudentUILProfileMeView,
    StudentForwardToUILView,
    StudentForwardToDormView,
    StudentForwardToStudentDeanView,
    DormForwardedLettersListView,
    StudentDeanForwardedLettersListView,
    DeanUnsealScoreSheetView,
    DeanScheduleDefenseView,
    DeanSubmitFinalGradeView,
    DeanChatView,
    DeanChatSendView,
    DeanChatUnreadCountView,
    StudentDeanChatView,
    StudentDeanChatSendView,
    UILChatView,
    UILChatSendView,
    UILChatUnreadCountView,
    StudentUILChatView,
    StudentUILChatSendView,
    StudentChatUnreadCountView,
)

app_name = "uil_profiles"

urlpatterns = [
    path("resume/", ResumeUploadView.as_view(), name="resume-upload"),
    path("resume/status/<int:pk>/", ResumeStatusView.as_view(), name="resume-status"),
    path("resume/confirm/<int:pk>/", ResumeConfirmView.as_view(), name="resume-confirm"),
    path("resume/<int:pk>/confirm/", ResumeConfirmView.as_view(), name="resume-confirm-alt"),

    # Track 1 Department Dean & Student Document Forwarding Endpoints
    path("student/me/", StudentUILProfileMeView.as_view(), name="student-uil-me"),
    path("dean/students/", DeanStudentListView.as_view(), name="dean-students"),
    path("dean/verify-student/<str:pk>/", DeanVerifyStudentView.as_view(), name="dean-verify-student"),
    path("dean/issue-letter/<str:student_id>/", DeanIssueLetterView.as_view(), name="dean-issue-letter"),
    path("student/forward-to-uil/", StudentForwardToUILView.as_view(), name="student-forward-to-uil"),
    path("student/forward-to-dorm/", StudentForwardToDormView.as_view(), name="student-forward-to-dorm"),
    path("student/forward-to-student-dean/", StudentForwardToStudentDeanView.as_view(), name="student-forward-to-student-dean"),
    path("dorm/forwarded-letters/", DormForwardedLettersListView.as_view(), name="dorm-forwarded-letters"),
    path("student-dean/forwarded-letters/", StudentDeanForwardedLettersListView.as_view(), name="student-dean-forwarded-letters"),
    path("dean/unseal-score-sheet/<uuid:team_id>/", DeanUnsealScoreSheetView.as_view(), name="dean-unseal-score-sheet"),
    path("dean/schedule-defense/<uuid:team_id>/", DeanScheduleDefenseView.as_view(), name="dean-schedule-defense"),
    path("dean/submit-final-grade/<uuid:team_id>/", DeanSubmitFinalGradeView.as_view(), name="dean-submit-final-grade"),

    # Active Dean-to-Verified-Student Direct Chat Channel Endpoints
    path("dean/chat/unread-count/", DeanChatUnreadCountView.as_view(), name="dean-chat-unread-count"),
    path("dean/chat/<str:student_id>/", DeanChatView.as_view(), name="dean-chat"),
    path("dean/chat/<str:student_id>/send/", DeanChatSendView.as_view(), name="dean-chat-send"),
    path("student/dean-chat/", StudentDeanChatView.as_view(), name="student-dean-chat"),
    path("student/dean-chat/send/", StudentDeanChatSendView.as_view(), name="student-dean-chat-send"),

    # Active UIL-to-Verified-Student Direct Chat Channel Endpoints
    path("uil/chat/unread-count/", UILChatUnreadCountView.as_view(), name="uil-chat-unread-count"),
    path("uil/chat/<str:student_id>/", UILChatView.as_view(), name="uil-chat"),
    path("uil/chat/<str:student_id>/send/", UILChatSendView.as_view(), name="uil-chat-send"),
    path("student/uil-chat/", StudentUILChatView.as_view(), name="student-uil-chat"),
    path("student/uil-chat/send/", StudentUILChatSendView.as_view(), name="student-uil-chat-send"),
    path("student/chat-unread-count/", StudentChatUnreadCountView.as_view(), name="student-chat-unread-count"),
]
