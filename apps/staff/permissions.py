from apps.core.permissions import TenantPermission
from apps.users.constants import UserRole

from .models import StaffProfile


class IsGymManagerOrSelf(TenantPermission):
    """Managers, plus a staff member acting on their own profile's records.

    The profile is named by the URL — ``staff_pk`` on the nested routes, ``pk``
    on a StaffProfileViewSet detail action. My Profile lets an instructor keep
    their own availability, class types and payment details up to date; without
    this those saves were refused and nothing they entered was kept.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.user.role in UserRole.MANAGEMENT_ROLES:
            return True
        staff_pk = str(view.kwargs.get("staff_pk") or view.kwargs.get("pk") or "")
        if not staff_pk.isdigit():
            return False
        return StaffProfile.objects.filter(
            pk=staff_pk,
            tenant=request.tenant,
            user=request.user,
            is_deleted=False,
        ).exists()
