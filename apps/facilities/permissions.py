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
