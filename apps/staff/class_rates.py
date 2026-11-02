"""
Class rates: what an instructor is paid for each class type they teach.

A class rate is a StaffPayRateOverride for one class type at any site. It
beats the instructor's default pay rate when invoices are priced.

Rates are dated, so changing one never rewrites what was already paid: the
new rate starts on its ``effective_from`` date and the old one ends the day
before. Classes earlier than that keep the old rate.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import models, transaction

from .models import StaffPayRateOverride, StaffProfile


def _class_rates(staff: StaffProfile, class_type_id: int):
    """Class-wide (any site) rates for one class type, not deleted."""
    return StaffPayRateOverride.objects.filter(
        tenant=staff.tenant, staff=staff, class_type_id=class_type_id, site__isnull=True, is_deleted=False,
    )


def current_class_rate(staff: StaffProfile, class_type_id: int, on: date) -> StaffPayRateOverride | None:
    return (
        _class_rates(staff, class_type_id)
        .filter(effective_from__lte=on)
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=on))
        .order_by("-effective_from")
        .first()
    )


def ongoing_class_rate(staff: StaffProfile, class_type_id: int) -> StaffPayRateOverride | None:
    """The rate going forward: the latest one with no end date, if any."""
    return (
        _class_rates(staff, class_type_id)
        .filter(effective_to__isnull=True)
        .order_by("-effective_from")
        .first()
    )


def _same(rate: StaffPayRateOverride, rate_type: str, amount: Decimal, per_head_rate: Decimal) -> bool:
    return rate.rate_type == rate_type and rate.amount == amount and rate.per_head_rate == per_head_rate


@transaction.atomic
def set_class_rate(
    staff: StaffProfile,
    class_type_id: int,
    *,
    rate_type: str,
    amount: Decimal,
    per_head_rate: Decimal,
    effective_from: date,
    user=None,
) -> StaffPayRateOverride:
    """Pay ``staff`` this rate for the class type from ``effective_from`` on.

    Rates that start on or after that date are replaced; one that started
    earlier is ended the day before.
    """
    current = current_class_rate(staff, class_type_id, effective_from)
    if current is not None and _same(current, rate_type, amount, per_head_rate):
        return current

    overlapping = _class_rates(staff, class_type_id).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=effective_from),
    )
    for rate in overlapping:
        if rate.effective_from >= effective_from:
            rate.is_deleted = True
            rate.updated_by = user
            rate.save(update_fields=["is_deleted", "updated_by", "updated_at"])
        else:
            rate.effective_to = effective_from - timedelta(days=1)
            rate.updated_by = user
            rate.save(update_fields=["effective_to", "updated_by", "updated_at"])

    return StaffPayRateOverride.objects.create(
        tenant=staff.tenant,
        staff=staff,
        class_type_id=class_type_id,
        site=None,
        rate_type=rate_type,
        amount=amount,
        per_head_rate=per_head_rate,
        effective_from=effective_from,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def end_class_rate(staff: StaffProfile, class_type_id: int, *, last_day: date, user=None) -> None:
    """Stop the class rate after ``last_day``; the default pay rate applies after."""
    for rate in _class_rates(staff, class_type_id).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=last_day),
    ):
        if rate.effective_from > last_day:
            rate.is_deleted = True
            rate.save(update_fields=["is_deleted", "updated_at"])
        else:
            rate.effective_to = last_day
            rate.updated_by = user
            rate.save(update_fields=["effective_to", "updated_by", "updated_at"])
