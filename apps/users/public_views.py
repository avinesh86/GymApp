"""
Public (unauthenticated) endpoints for staff invite acceptance.

Mounted under /api/v1/public/, which the tenant middleware exempts — these
views resolve the user from the signed invite token, not from a tenant host.
"""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .invites import get_user_from_invite


class ValidateInviteView(APIView):
    """GET /api/v1/public/set-password/?uid=&token= — check a link before showing the form."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        user = get_user_from_invite(
            request.query_params.get("uid", ""),
            request.query_params.get("token", ""),
        )
        if user is None:
            return Response({"valid": False}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"valid": True, "email": user.email, "name": user.full_name}
        )


class SetPasswordView(APIView):
    """POST /api/v1/public/set-password/ {uid, token, password} — accept invite."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        password = request.data.get("password", "")

        user = get_user_from_invite(uid, token)
        if user is None:
            return Response(
                {"detail": "This link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(password, user=user)
        except DjangoValidationError as exc:
            return Response({"password": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.is_active = True
        user.save(update_fields=["password", "is_active"])
        # Setting the password changes the hash, so the invite token is now spent.
        return Response({"detail": "Password set. You can now log in."})
