from rest_framework.permissions import BasePermission
from django.contrib.auth import get_user_model

User = get_user_model()


class IsAdminRole(BasePermission):
    """
    Allow access only to authenticated users
    whose application role is admin, is_superuser, or is_staff.
    """

    message = "Only administrators can perform this action."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        user_role = str(getattr(user, "role", "")).upper()
        return (
            user_role == User.Role.ADMIN
            or user_role == "ADMIN"
            or user.is_superuser 
            or user.is_staff
        )


class IsStudent(BasePermission):
    """
    Allow access only to authenticated users whose application role is
    ``student`` (Task 2.6 — role-based access control).
    """

    message = "Only students can perform this action."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        user_role = str(getattr(user, "role", "")).upper()
        return user_role in (User.Role.STUDENT, "STUDENT")


class IsCompanyHROrAdmin(BasePermission):
    """
    Allow access to Company HR or Administrators.
    """

    message = "Only Company HR or administrators can perform this action."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        user_role = str(getattr(user, "role", "")).upper()
        return (
            user_role in (User.Role.COMPANY_HR, "COMPANY_HR", User.Role.ADMIN, "ADMIN")
            or user.is_superuser
            or user.is_staff
        )
