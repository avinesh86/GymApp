from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.core.permissions import IsAdmin, IsOwner

from .models import Site, TenantBranding, TenantSettings
from .serializers import SiteSerializer, TenantBrandingSerializer, TenantSettingsSerializer


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
        from apps.whatsapp.serializers import WhatsAppAccountSerializer
        account = self._get_or_create_account(request)
        serializer = WhatsAppAccountSerializer(account, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(WhatsAppAccountSerializer(account).data)


class CurrentTenantBrandingView(APIView):
    """GET / PATCH the branding for the current tenant."""

    permission_classes = [IsAdmin]

    def get(self, request):
        branding, _ = TenantBranding.objects.get_or_create(tenant=request.tenant)
        serializer = TenantBrandingSerializer(branding)
        return Response(serializer.data)

    def patch(self, request):
        branding, _ = TenantBranding.objects.get_or_create(tenant=request.tenant)
        serializer = TenantBrandingSerializer(branding, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CurrentTenantSettingsView(APIView):
    """GET / PATCH settings for the current tenant."""

    permission_classes = [IsAdmin]

    def get(self, request):
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        serializer = TenantSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def patch(self, request):
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        serializer = TenantSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


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
