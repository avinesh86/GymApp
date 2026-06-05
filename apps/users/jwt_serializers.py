from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class TenantTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Authenticate globally by email + password, then issue a gym-scoped token.

    A user may belong to several gyms. The flow:
    - exactly one gym  -> issue a token scoped to it.
    - several gyms, no tenant_id given -> return `requires_gym_selection` with the
      list of gyms (HTTP 200, no token); the client re-submits with `tenant_id`.
    - several gyms, tenant_id given -> validate membership and issue the token.

    The token carries `tenant_id` + `role` for the chosen gym; authentication
    activates that gym per request.
    """

    tenant_id = serializers.IntegerField(required=False)

    @classmethod
    def get_token(cls, user):
        # Embed the user's default gym as a baseline; validate() overrides these
        # with the chosen gym when the account belongs to several.
        token = super().get_token(user)
        token["tenant_id"] = user.tenant_id
        token["role"] = user.role
        return token

    def validate(self, attrs):
        # Parent authenticates the credentials and sets self.user (raises 401 on
        # bad credentials). We discard its default token and build a gym-scoped one.
        super().validate(attrs)

        memberships = list(
            self.user.memberships.filter(is_active=True).select_related("tenant")
        )
        if not memberships:
            raise serializers.ValidationError(
                {"detail": "This account has no active gym access."}
            )

        requested = self.initial_data.get("tenant_id")
        if requested:
            chosen = next(
                (m for m in memberships if str(m.tenant_id) == str(requested)), None
            )
            if chosen is None:
                raise serializers.ValidationError(
                    {"tenant_id": "You don't have access to that gym."}
                )
        elif len(memberships) == 1:
            chosen = memberships[0]
        else:
            # Not an error — the client must pick a gym, then re-submit with
            # tenant_id. Returned as-is (HTTP 200) so the structured gym list
            # isn't coerced into error strings.
            return {
                "requires_gym_selection": True,
                "gyms": [
                    {
                        "tenant_id": m.tenant_id,
                        "slug": m.tenant.slug,
                        "name": m.tenant.name,
                        "role": m.role,
                    }
                    for m in memberships
                ],
            }

        refresh = self.get_token(self.user)
        refresh["tenant_id"] = chosen.tenant_id
        refresh["role"] = chosen.role
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "tenant_id": chosen.tenant_id,
            "role": chosen.role,
        }
