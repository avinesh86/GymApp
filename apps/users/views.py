from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.audit import log_audit
from apps.core.permissions import IsAdmin

from .emails import send_password_reset_email
from .models import Membership, User
from .serializers import ChangePasswordSerializer, UserListSerializer, UserSerializer


class UserViewSet(ModelViewSet):
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == "list":
            return UserListSerializer
        return UserSerializer

    def get_queryset(self):
        # List users by membership in the active gym, not by User.tenant — a
        # user's default tenant may differ from the gym they're a member of.
        return (
            User.objects.filter(
                memberships__tenant=self.request.tenant,
                memberships__is_active=True,
                is_active=True,
            )
            .distinct()
            .order_by("email")
        )

    def perform_create(self, serializer):
        user = serializer.save(tenant=self.request.tenant)
        Membership.objects.get_or_create(
            user=user,
            tenant=self.request.tenant,
            defaults={"role": user.role, "is_active": True},
        )

    def destroy(self, request, *args, **kwargs):
        # Removing a user is per-gym: deactivate their membership in THIS gym.
        # Only disable the login entirely if they have no other active gym.
        instance = self.get_object()
        instance.memberships.filter(tenant=request.tenant).update(is_active=False)
        if not instance.memberships.filter(is_active=True).exists():
            instance.is_active = False
            instance.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get", "patch"], url_path="me", permission_classes=[])
    def me(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        if request.method == "GET":
            return Response(UserSerializer(request.user).data)
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="send-password-reset")
    def send_password_reset(self, request, pk=None):
        """Owner/admin emails a password-reset link to a user in their gym.

        Scoped by get_queryset (membership in request.tenant), so an admin can
        only reset users that belong to their gym. The link is the same
        single-use token flow the user would get from "forgot password" — the
        admin never sees or sets the password.
        """
        target = self.get_object()
        send_password_reset_email(target)
        log_audit(request.user, "send_password_reset", target, {}, {"email": target.email})
        return Response({"detail": f"Password reset link sent to {target.email}."})

    @action(detail=False, methods=["post"], url_path="change-password", permission_classes=[])
    def change_password(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password updated."})
