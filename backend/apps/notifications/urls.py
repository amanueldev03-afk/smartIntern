from django.urls import path
from .views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    NotificationUnreadCountView,
)

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("<uuid:pk>/mark-read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("<uuid:pk>/read/", NotificationMarkReadView.as_view(), name="notification-read-compat"),
    path("mark-all-read/", NotificationMarkAllReadView.as_view(), name="notification-mark-all-read"),
    path("unread-count/", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
]

