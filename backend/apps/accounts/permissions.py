from rest_framework.permissions import BasePermission
from django.contrib.auth import get_user_model

User = get_user_model()


class BaseRolePermission(BasePermission):
    """
    Base permission ensuring the user is authenticated and matches one of the allowed roles.
    """
    allowed_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True
        user_role = str(getattr(request.user, "role", "")).upper()
        allowed_upper = [str(r).upper() for r in self.allowed_roles]
        return user_role in allowed_upper


class IsStudent(BaseRolePermission):
    """
    Allows access only to authenticated students.
    """
    allowed_roles = (User.Role.STUDENT, "STUDENT", "student")


class IsDeptDean(BaseRolePermission):
    """
    Allows access only to authenticated Department Deans.
    """
    allowed_roles = (User.Role.DEPT_DEAN,)


class IsUILOfficer(BaseRolePermission):
    """
    Allows access only to authenticated University-Industry Linkage (UIL) Officers.
    """
    allowed_roles = (User.Role.UIL_OFFICER,)


class IsAcademicAdvisor(BaseRolePermission):
    """
    Allows access only to authenticated Academic Advisors.
    """
    allowed_roles = (User.Role.ADVISOR,)


class IsCompanyHR(BaseRolePermission):
    """
    Allows access only to authenticated Company HR representatives.
    """
    allowed_roles = (User.Role.COMPANY_HR,)


class IsCompanyMentor(BaseRolePermission):
    """
    Allows access only to authenticated Company Mentors.
    """
    allowed_roles = (User.Role.COMPANY_MENTOR,)


class IsLogisticsAdmin(BasePermission):
    """
    Allows access to logistics coordinators (Student Union and Dormitory Administration).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False) or getattr(request.user, "is_staff", False):
            return True
        user_role = str(getattr(request.user, "role", "")).upper()
        return user_role in (str(User.Role.STUDENT_UNION).upper(), str(User.Role.DORM_ADMIN).upper())


class IsDormAdmin(BaseRolePermission):
    """
    Allows access only to authenticated Dormitory Administrators.
    """
    allowed_roles = (User.Role.DORM_ADMIN,)


class IsStudentUnion(BaseRolePermission):
    """
    Allows access only to authenticated Student Union / Student Deans.
    """
    allowed_roles = (User.Role.STUDENT_UNION,)


class IsFinanceOfficer(BaseRolePermission):
    """
    Allows access only to authenticated Finance Officers.
    """
    allowed_roles = (User.Role.FINANCE_OFFICER,)


class IsSystemAdmin(BasePermission):
    """
    Allows access only to System Administrators or Superusers.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user_role = str(getattr(request.user, "role", "")).upper()
        admin_roles = (str(User.Role.ADMIN).upper(), "ADMIN", "ADMINISTRATOR")
        return user_role in admin_roles or getattr(request.user, "is_superuser", False) or getattr(request.user, "is_staff", False)
