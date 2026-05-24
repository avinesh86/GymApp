"""
Stripe integration for FitOps tenant billing.
Product: prod_UZsIYi4XDpNbhx (14-day trial then subscription).
"""
import logging
from typing import Optional

import stripe
from django.conf import settings

logger = logging.getLogger(__name__)

FITOPS_PRODUCT_ID = "prod_UZsIYi4XDpNbhx"


def _get_stripe():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def get_product_price_id() -> Optional[str]:
    """Return the first active recurring price for the FitOps product."""
    s = _get_stripe()
    try:
        prices = s.Price.list(
            product=FITOPS_PRODUCT_ID,
            active=True,
            type="recurring",
            limit=1,
        )
        if prices.data:
            return prices.data[0].id
    except Exception as exc:
        logger.exception(
            "Failed to fetch Stripe price for product %s: %s",
            FITOPS_PRODUCT_ID,
            exc,
        )
    return None


def create_customer_and_subscription(
    tenant,
    user,
    payment_method_id: str,
) -> dict:
    """
    1. Create a Stripe customer and attach the given payment method.
    2. Create a subscription with a 14-day trial.

    Returns a dict with customer_id, subscription_id, subscription_status,
    and trial_end (Unix timestamp or None).
    """
    s = _get_stripe()

    customer = s.Customer.create(
        email=user.email,
        name=tenant.name,
        payment_method=payment_method_id,
        invoice_settings={"default_payment_method": payment_method_id},
        metadata={"tenant_id": str(tenant.id), "tenant_slug": tenant.slug},
    )

    price_id = get_product_price_id()
    if not price_id:
        raise ValueError(
            f"No active recurring price found for product {FITOPS_PRODUCT_ID}. "
            "Please create a price in the Stripe dashboard."
        )

    subscription = s.Subscription.create(
        customer=customer.id,
        items=[{"price": price_id}],
        trial_period_days=14,
        payment_settings={
            "payment_method_types": ["card"],
            "save_default_payment_method": "on_subscription",
        },
        expand=["latest_invoice.payment_intent"],
    )

    return {
        "customer_id": customer.id,
        "subscription_id": subscription.id,
        "subscription_status": subscription.status,
        "trial_end": subscription.trial_end,
    }
