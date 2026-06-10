from rest_framework.permissions import BasePermission

from apps.users.constants import UserRole


class TenantPermission(BasePermission):
    """
    Base permission that ensures the authenticated user belongs to the
    tenant resolved from the request.  All role-specific permissions
    should subclass this.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return False
        return request.user.tenant_id == tenant.id


def has_role(*roles):
    """
    Factory that returns a DRF permission class restricting access to users
    with one of the specified roles, after passing the tenant check.

    Usage::

        permission_classes = [has_role(UserRole.OWNER, UserRole.ADMIN)]
    """

    class RolePermission(TenantPermission):
        required_roles = roles

        def has_permission(self, request, view):
            if not super().has_permission(request, view):
                return False
            return request.user.role in self.required_roles

    RolePermission.__name__ = f"HasRole({'|'.join(roles)})"
    return RolePermission


class IsOwner(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == UserRole.OWNER


class IsAdmin(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
        )


class IsGymManager(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.GYM_MANAGER,
        )


class IsPayroll(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.PAYROLL,
        )


class IsTeamLeader(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.GYM_MANAGER,
            UserRole.TEAM_LEADER,
        )


class IsInstructor(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == UserRole.INSTRUCTOR


class IsInstructorOrAbove(TenantPermission):
    """Any staff role that can participate in the cover flow — instructors
    (self-service requests) plus team leaders / managers / admins / owner."""

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.GYM_MANAGER,
            UserRole.TEAM_LEADER,
            UserRole.INSTRUCTOR,
        )


class IsClassCountAdmin(TenantPermission):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.GYM_MANAGER,
            UserRole.CLASS_COUNT_ADMIN,
        )
