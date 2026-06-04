"""Staff-related domain services."""

import logging

from apps.users.constants import UserRole
from apps.users.emails import send_invite_email
from apps.users.models import Membership, User

logger = logging.getLogger(__name__)


def _split_name(name: str) -> tuple[str, str]:
    parts = (name or "").split()
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:])


def _ensure_membership(user: User, tenant, role: str) -> None:
    """Make sure the user has an active membership in this gym."""
    membership, created = Membership.objects.get_or_create(
        user=user,
        tenant=tenant,
        defaults={"role": role, "is_active": True},
    )
    if not created and not membership.is_active:
        membership.is_active = True
        membership.save(update_fields=["is_active"])


def provision_user_for_staff(staff, *, send_invite: bool = False) -> tuple[User, bool]:
    """Ensure a StaffProfile has a linked login User + a membership in its gym.

    One global User per person (keyed by email). A person who works at several
    gyms keeps one login and gains a Membership per gym:

    - Already linked: just ensure the gym membership exists. created=False.
    - A User with this email exists (this or another gym): reuse it, add a
      membership for this gym, link it. created=False.
    - No such User: create one with an unusable password (login blocked until
      the invite is accepted) and, when send_invite is set, email the
      set-password link. created=True.

    Returns (user, created).
    """
    role = UserRole.from_staff_role(staff.role)

    if staff.user_id:
        _ensure_membership(staff.user, staff.tenant, role)
        return staff.user, False

    email = (staff.email or "").strip().lower()
    if not email:
        raise ValueError("StaffProfile has no email; cannot provision a user.")

    user = User.objects.filter(email=email).first()
    created = False
    if user is None:
        first_name, last_name = _split_name(staff.name)
        # create_user calls set_password(None) -> unusable password, so the
        # account can't log in until the invite is accepted.
        user = User.objects.create_user(
            email=email,
            tenant=staff.tenant,
            first_name=first_name,
            last_name=last_name,
            role=role,
            is_active=True,
            password=None,
        )
        created = True

    _ensure_membership(user, staff.tenant, role)

    staff.user = user
    staff.save(update_fields=["user", "updated_at"])

    # Only brand-new accounts need an invite; an existing person added to
    # another gym already has a password.
    if created and send_invite:
        send_invite_email(user)

    return user, created
