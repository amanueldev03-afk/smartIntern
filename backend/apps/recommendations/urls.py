from django.urls import path

from .views import (
    StudentRecommendationView,
    RecommendationHistoryListView,
    RecommendationFeedbackView,
)

urlpatterns = [
    path(
        "",
        StudentRecommendationView.as_view(),
        name="student-recommendations",
    ),
    path(
        "history/",
        RecommendationHistoryListView.as_view(),
        name="recommendation-history",
    ),
    path(
        "<int:internship_id>/feedback/",
        RecommendationFeedbackView.as_view(),
        name="recommendation-feedback",
    ),
]
