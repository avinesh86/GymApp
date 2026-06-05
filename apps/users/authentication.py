"""JWT authentication that activates the gym (tenant + role) carried in the token."""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class MembershipJWTAuthentication(JWTAuthentication):
    """Resolve the user, then sync their active gym's tenant + role onto them.

    A user may belong to several gyms with a different role in each. The token
    names the active gym (``tenant_id``); we look up the matching active
    Membership and copy its tenant/role onto the in-memory user, so the existing
    permission classes (which read ``user.role`` / ``user.tenant_id``) operate on
    the selected gym without any change.

    Legacy tokens without a ``tenant_id`` claim leave the user's stored
    tenant/role untouched, preserving backward compatibility.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        tenant_id = validated_token.get("tenant_id")
        if tenant_id is None:
            return user

        membership = user.memberships.filter(
            tenant_id=tenant_id, is_active=True
        ).first()
        if membership is None:
            raise AuthenticationFailed(
                "No active membership for the selected gym.", code="no_membership"
            )

        user.tenant_id = membership.tenant_id
        user.role = membership.role
        return user
