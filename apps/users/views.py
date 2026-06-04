from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.permissions import IsAdmin

from .models import Membership, User
from .serializers import ChangePasswordSerializer, UserListSerializer, UserSerializer


class UserViewSet(ModelViewSet):
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == "list":
            return UserListSerializer
        return UserSerializer

    def get_queryset(self):
        return (
            User.objects.filter(tenant=self.request.tenant, is_active=True)
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
        instance = self.get_object()
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

    @action(detail=False, methods=["post"], url_path="change-password", permission_classes=[])
    def change_password(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password updated."})
