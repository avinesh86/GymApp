"""Staff-related domain services."""

import logging
from typing import TYPE_CHECKING

from apps.users.constants import UserRole
from apps.users.emails import send_invite_email
from apps.users.models import Membership, User

if TYPE_CHECKING:
    # Imported lazily inside the functions at runtime — apps.staff.models
    # imports from users, so a module-level import would be circular.
    from apps.staff.models import StaffProfile

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


def provision_user(*, email, name, tenant, role, send_invite=False) -> tuple[User, bool]:
    """Find-or-create the global login User for a staff member and gym membership.

    One global User per person (keyed by email). A person at several gyms keeps
    one login and gains a Membership per gym:

    - A User with this email exists (this or another gym): reuse it, ensure a
      membership for this gym. created=False.
    - No such User: create one with an unusable password (login blocked until
      the invite is accepted) and, when send_invite is set, email the
      set-password link. created=True.

    Does NOT touch StaffProfile — call before creating/saving the profile, since
    StaffProfile.user is required. Returns (user, created).
    """
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("A staff email is required to provision a user.")

    mapped_role = UserRole.from_staff_role(role)

    user = User.objects.filter(email=email).first()
    created = False
    if user is None:
        first_name, last_name = _split_name(name)
        # create_user calls set_password(None) -> unusable password.
        user = User.objects.create_user(
            email=email,
            tenant=tenant,
            first_name=first_name,
            last_name=last_name,
            role=mapped_role,
            is_active=True,
            password=None,
        )
        created = True

    _ensure_membership(user, tenant, mapped_role)

    # Only brand-new accounts need an invite; an existing person added to
    # another gym already has a password.
    if created and send_invite:
        send_invite_email(user)

    return user, created


def provision_user_for_staff(staff, *, send_invite: bool = False) -> tuple[User, bool]:
    """Ensure an already-saved StaffProfile has a linked login User + membership.

    Used by the backfill command for legacy profiles. New profiles should set
    their user at creation time via provision_user(). Returns (user, created).
    """
    if staff.user_id:
        _ensure_membership(staff.user, staff.tenant, UserRole.from_staff_role(staff.role))
        return staff.user, False

    user, created = provision_user(
        email=staff.email,
        name=staff.name,
        tenant=staff.tenant,
        role=staff.role,
        send_invite=send_invite,
    )
    staff.user = user
    staff.save(update_fields=["user", "updated_at"])
    return user, created


def provision_staff_for_user(user, tenant) -> tuple["StaffProfile | None", bool]:
    """Ensure an instructor-level user has a StaffProfile in `tenant`.

    The Access screen creates a login; scheduling, class assignment and the
    whole cover system work on StaffProfile. Without this, someone added there
    as an Instructor has an account but is invisible to the roster and can
    never be offered cover.

    Only instructor-level roles get a profile — an owner or payroll user is not
    someone you put on the timetable. Returns (profile, created); profile is
    None when the role does not warrant one.
    """
    from apps.staff.models import StaffProfile

    if user.role not in UserRole.STAFF_ROLES:
        return None, False

    existing = StaffProfile.objects.filter(
        tenant=tenant, user=user, is_deleted=False
    ).first()
    if existing:
        return existing, False

    profile = StaffProfile.objects.create(
        tenant=tenant,
        user=user,
        name=user.full_name or user.email,
        email=user.email,
        role=user.role,
        status=StaffProfile.Status.ACTIVE,
    )
    return profile, True
