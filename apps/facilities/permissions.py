from apps.core.permissions import TenantPermission

from .services import FACILITIES_ROLES, get_config


class CanManageFacilities(TenantPermission):
    """Owner, admin, gym manager, team leader and payroll."""

    message = "Facilities is only open to managers, team leaders and payroll."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in FACILITIES_ROLES


class _FeatureOn(TenantPermission):
    flag = ""
    message = "This part of Facilities is turned off in Settings."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and getattr(get_config(request.tenant), self.flag)


class EquipmentEnabled(_FeatureOn):
    flag = "equipment_enabled"
    message = "Equipment inventory is turned off in Settings."


class MaintenanceEnabled(_FeatureOn):
    flag = "maintenance_enabled"
    message = "Maintenance tracking is turned off in Settings."


class FaultReportingEnabled(_FeatureOn):
    flag = "fault_reporting_enabled"
    message = "Fault reporting is turned off in Settings."


class ChecklistsEnabled(_FeatureOn):
    flag = "checklists_enabled"
    message = "Checklists are turned off in Settings."


class CanManageChecklists(TenantPermission):
    """Owner, admin and gym manager set checklists up; others with
    Facilities access can see them."""

    message = "Only the owner, admins and gym managers can change checklists."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return request.user.role in FACILITIES_ROLES
        return request.user.role in ("owner", "admin", "gym_manager")


class LicencesEnabled(_FeatureOn):
    flag = "licences_enabled"
    message = "Licences are turned off in Settings."


class SubscriptionsEnabled(_FeatureOn):
    flag = "subscriptions_enabled"
    message = "Subscriptions are turned off in Settings."


class CanManageRecords(TenantPermission):
    """Every Facilities role reads licences and subscriptions (costs too);
    owner, admin and gym manager add and change them."""

    message = "Only the owner, admins and gym managers can change these."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return request.user.role in FACILITIES_ROLES
        return request.user.role in ("owner", "admin", "gym_manager")
