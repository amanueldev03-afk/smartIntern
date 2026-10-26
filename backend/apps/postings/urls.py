from django.urls import path
from apps.postings.views import PostingRecommendationView

app_name = "postings"

urlpatterns = [
    path(
        "recommendations/",
        PostingRecommendationView.as_view(),
        name="posting-recommendations",
    ),
]
