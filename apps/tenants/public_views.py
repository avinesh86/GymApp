"""
Public signup endpoint — no authentication required.
Creates tenant, owner user, and Stripe customer+subscription atomically.
"""
import logging
from datetime import datetime, timezone as dt_tz

from django.db import transaction
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User

from .models import Tenant, TenantBranding, TenantDomain, TenantSettings
from .stripe_service import create_customer_and_subscription

logger = logging.getLogger(__name__)

REQUIRED_SIGNUP_FIELDS = [
    "business_name",
    "email",
    "first_name",
    "last_name",
    "password",
    "payment_method_id",
]


def _unique_slug(name: str) -> str:
    """Generate a slug from name, appending a numeric suffix until it is unique."""
    base = slugify(name) or "gym"
    slug = base
    suffix = 1
    while Tenant.objects.filter(slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def _validate_signup_data(data: dict) -> dict:
    """Return a dict of field -> error message for any validation failures."""
    errors = {}

    for field in REQUIRED_SIGNUP_FIELDS:
        value = data.get(field, "")
        if not isinstance(value, str) or not value.strip():
            errors[field] = "This field is required."

    if data.get("password") and len(data["password"]) < 8:
        errors["password"] = "Password must be at least 8 characters."

    if data.get("email") and User.objects.filter(
        email=data["email"].strip().lower()
    ).exists():
        errors["email"] = "An account with this email already exists."

    return errors


class TenantSignupView(APIView):
    """
    POST /api/v1/public/signup/

    Creates a new tenant, owner user, and Stripe subscription in a single
    atomic transaction. Returns a JWT pair so the user is immediately
    authenticated after signup.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        data = request.data

        errors = _validate_signup_data(data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            tenant, user = self._create_tenant_and_user(data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Signup failed during tenant/user creation: %s", exc)
            return Response(
                {"detail": "Signup failed. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return self._build_success_response(tenant, user)

    def _create_tenant_and_user(self, data: dict):
        """
        Run the signup flow: DB objects in an atomic block, then Stripe
        outside it so a Stripe failure rolls back cleanly without leaving
        orphaned Stripe objects.
        """
        # Step 1: Create tenant + user atomically
        with transaction.atomic():
            slug = _unique_slug(data["business_name"])
            tenant = Tenant.objects.create(
                name=data["business_name"].strip(),
                slug=slug,
                signup_email=data["email"].strip().lower(),
                signup_phone=data.get("phone", "").strip(),
            )

            TenantSettings.objects.create(tenant=tenant)
            TenantBranding.objects.create(
                tenant=tenant,
                app_name=data["business_name"].strip(),
            )

            # Create a default domain record so the tenant is reachable
            # via subdomain (e.g. slug.fitops.app) in addition to JWT.
            TenantDomain.objects.create(
                tenant=tenant,
                domain=f"{slug}.fitops.app",
                is_primary=True,
            )

            user = User(
                email=data["email"].strip().lower(),
                first_name=data["first_name"].strip(),
                last_name=data.get("last_name", "").strip(),
                role="owner",
                tenant=tenant,
                is_active=True,
            )
            user.set_password(data["password"])
            user.save()

        # Step 2: Stripe call OUTSIDE the atomic block — if this fails the
        # DB rows already exist but the tenant simply has no billing yet
        # (subscription_status stays at its default).  No orphaned Stripe
        # objects are created because we haven't called Stripe yet.
        try:
            stripe_result = create_customer_and_subscription(
                tenant=tenant,
                user=user,
                payment_method_id=data["payment_method_id"],
            )
        except Exception:
            # Clean up the tenant+user we just created so the email is
            # freed and the user can retry.
            logger.exception(
                "Stripe setup failed for tenant %s — rolling back DB records",
                tenant.pk,
            )
            user.delete()
            tenant.delete()
            raise

        # Step 3: Persist Stripe IDs back to the tenant
        tenant.stripe_customer_id = stripe_result["customer_id"]
        tenant.stripe_subscription_id = stripe_result["subscription_id"]
        tenant.subscription_status = stripe_result["subscription_status"]
        if stripe_result.get("trial_end"):
            tenant.trial_ends_at = datetime.fromtimestamp(
                stripe_result["trial_end"], tz=dt_tz.utc
            )
        tenant.save(update_fields=[
            "stripe_customer_id",
            "stripe_subscription_id",
            "subscription_status",
            "trial_ends_at",
        ])

        return tenant, user

    def _build_success_response(self, tenant, user) -> Response:
        refresh = RefreshToken.for_user(user)
        refresh["tenant_id"] = tenant.id
        refresh["role"] = user.role

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "tenant_slug": tenant.slug,
                "tenant_name": tenant.name,
                "setup_completed": tenant.setup_completed,
                "trial_ends_at": (
                    tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None
                ),
            },
            status=status.HTTP_201_CREATED,
        )
