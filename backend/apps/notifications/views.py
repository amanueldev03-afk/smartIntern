from rest_framework import serializers, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "notification_type",
            "link",
            "is_read",
            "metadata",
            "created_at",
            "actor_name",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return getattr(obj.actor, "full_name", None) or obj.actor.email
        return None


@extend_schema(tags=["Notifications"])
class NotificationListView(APIView):
    """
    List user notifications with unread count.
    GET /api/v1/notifications/?unread=true
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user)
        unread_only = request.query_params.get("unread", "").lower() in ["true", "1", "yes"]
        if unread_only:
            qs = qs.filter(is_read=False)

        notifications = qs[:50]
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        serializer = NotificationSerializer(notifications, many=True)
        return Response({
            "results": serializer.data,
            "unread_count": unread_count,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Notifications"])
class NotificationMarkReadView(APIView):
    """
    Mark a specific notification as read.
    POST /api/v1/notifications/<uuid:pk>/mark-read/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notif = get_object_or_404(Notification, id=pk, recipient=request.user)
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({
            "message": "Notification marked as read.",
            "unread_count": unread_count,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Notifications"])
class NotificationMarkAllReadView(APIView):
    """
    Mark all notifications for authenticated user as read.
    POST /api/v1/notifications/mark-all-read/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({
            "message": "All notifications marked as read.",
            "unread_count": 0,
        }, status=status.HTTP_200_OK)


@extend_schema(tags=["Notifications"])
class NotificationUnreadCountView(APIView):
    """
    Lightweight endpoint returning unseen count for badge polling.
    GET /api/v1/notifications/unread-count/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({"unread_count": count}, status=status.HTTP_200_OK)

