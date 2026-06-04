"""
Stateless set-password / invite links for staff onboarding.

Reuses Django's password-reset token machinery: the token is bound to the
user's current password hash and last_login, so it is single-use — once the
user sets a password the same link stops validating. No extra DB model needed.
"""

from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .models import User


def make_invite_token(user: User) -> tuple[str, str]:
    """Return (uidb64, token) for a set-password link."""
    return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)


def build_invite_url(user: User) -> str:
    """Full frontend URL the staff member clicks to set their password."""
    uidb64, token = make_invite_token(user)
    query = urlencode({"uid": uidb64, "token": token})
    return f"{settings.FRONTEND_URL.rstrip('/')}/set-password?{query}"


def get_user_from_invite(uidb64: str, token: str) -> User | None:
    """Return the user if the uid/token pair is valid, else None."""
    try:
        user_pk = urlsafe_base64_decode(uidb64).decode()
        user = User.objects.get(pk=user_pk)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    if not default_token_generator.check_token(user, token):
        return None
    return user
