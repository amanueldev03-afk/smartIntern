from django.urls import path
from .views import ApplicationHistoryListView, TrackApplicationView

app_name = "applications"

urlpatterns = [
    path("history/", ApplicationHistoryListView.as_view(),
         name="application-history"),
    path("track/", TrackApplicationView.as_view(), name="track-application"),
]
