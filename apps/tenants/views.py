from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.core.permissions import IsAdmin, IsOwner, TenantPermission

from .models import Site, TenantBranding, TenantSettings
from .serializers import SiteSerializer, TenantBrandingSerializer, TenantSettingsSerializer



def guarded_patch(request, model, instance, serializer_class, **save_kwargs):
    """Apply a PATCH unless it would overwrite a change made since the form opened.

    Settings forms send, alongside the fields they change, ``expected``: the
    values those fields had when the form opened. If any has changed since (by
    another admin), nothing is saved and the answer is 409 with the fields that
    changed and the current values, so the form can say so. The row is locked
    while checking and saving, so a save can't slip in between the two.
    Requests without ``expected`` save as before.
    """
    if not hasattr(request.data, "items"):
        return Response(
            {"non_field_errors": ["Send the settings as an object of field: value."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    data = request.data.copy()
    expected = data.pop("expected", None)
    if isinstance(expected, list) and hasattr(request.data, "getlist"):
        expected = expected[-1]  # a form-encoded body
    if expected is not None and not isinstance(expected, dict):
        return Response(
            {"expected": ["Send the values the form opened with, as field: value."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    with transaction.atomic():
        locked = model.objects.select_for_update().get(pk=instance.pk)
        if expected:
            current = serializer_class(locked).data
            # Changed since the form opened, and not already set to what this
            # save sends (then there's nothing to choose between).
            changed = [
                field
                for field, value in expected.items()
                if field in current
                and current[field] != value
                and not (field in data and current[field] == data[field])
            ]
            if changed:
                return Response(
                    {
                        "detail": "These settings were changed by someone else since you opened them.",
                        "changed": changed,
                        "current": current,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        serializer = serializer_class(locked, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(**save_kwargs)
    return Response(serializer_class(locked).data)

class TenantSetupStatusView(APIView):
    """Returns whether the tenant has completed minimum setup (location + class type)."""

    def get(self, request):
        from apps.timetable.models import ClassType

        tenant = request.tenant
        has_location = tenant.sites.filter(is_active=True).exists()
        has_class_type = ClassType.objects.filter(tenant=tenant, is_active=True).exists()
        setup_completed = has_location and has_class_type

        if setup_completed and not tenant.setup_completed:
            tenant.setup_completed = True
            tenant.save(update_fields=["setup_completed"])

        return Response({
            "setup_completed": setup_completed,
            "has_location": has_location,
            "has_class_type": has_class_type,
            "trial_ends_at": (
                tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None
            ),
            "subscription_status": tenant.subscription_status,
        })


class CurrentWhatsAppAccountView(APIView):
    """GET / PATCH the WhatsApp Business account for the current tenant."""

    permission_classes = [IsAdmin]

    def _get_or_create_account(self, request):
        from apps.whatsapp.models import WhatsAppAccount
        account, _ = WhatsAppAccount.objects.get_or_create(
            tenant=request.tenant,
            defaults={
                "display_name": request.tenant.name,
                "created_by": request.user,
                "updated_by": request.user,
            },
        )
        return account

    def get(self, request):
        from apps.whatsapp.serializers import WhatsAppAccountSerializer
        account = self._get_or_create_account(request)
        return Response(WhatsAppAccountSerializer(account).data)

    def patch(self, request):
        from apps.whatsapp.models import WhatsAppAccount
        from apps.whatsapp.serializers import WhatsAppAccountSerializer
        account = self._get_or_create_account(request)
        return guarded_patch(
            request, WhatsAppAccount, account, WhatsAppAccountSerializer, updated_by=request.user
        )


class CurrentTenantBrandingView(APIView):
    """GET / PATCH the branding for the current tenant."""

    permission_classes = [IsAdmin]

    def get(self, request):
        branding, _ = TenantBranding.objects.get_or_create(tenant=request.tenant)
        serializer = TenantBrandingSerializer(branding)
        return Response(serializer.data)

    def patch(self, request):
        branding, _ = TenantBranding.objects.get_or_create(tenant=request.tenant)
        return guarded_patch(request, TenantBranding, branding, TenantBrandingSerializer)


class CurrentTenantSettingsView(APIView):
    """GET / PATCH settings for the current tenant."""

    permission_classes = [IsAdmin]

    def get(self, request):
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        serializer = TenantSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def patch(self, request):
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        return guarded_patch(request, TenantSettings, settings_obj, TenantSettingsSerializer)


class TimetableDisplayView(APIView):
    """GET how the timetable is drawn — for everyone who can see it.

    The full settings are admin-only (they hold mail credentials), but
    managers and instructors see the timetable too and need its tile style.
    """

    permission_classes = [TenantPermission]

    def get(self, request):
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        return Response({"tile_style": settings_obj.timetable_tile_style})


class GymLocaleView(APIView):
    """GET the gym's timezone — for everyone signed in to the gym.

    The frontend shows every date and time, and works out "today" and "this
    week", in this zone rather than the viewer's browser's.
    """

    permission_classes = [TenantPermission]

    def get(self, request):
        from apps.core.timezones import tenant_timezone

        return Response({"timezone": tenant_timezone(request.tenant).key})


class SiteViewSet(ModelViewSet):
    serializer_class = SiteSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return Site.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
