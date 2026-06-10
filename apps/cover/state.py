"""
Cover-request state machine.

All CoverRequest status changes go through `transition()` so the allowed moves
are enforced in one place and every change is audited. Views and services must
not write `cover_request.status = ...` directly.
"""
from __future__ import annotations

from django.utils import timezone

from apps.core.audit import log_audit

from .models import CoverRequest

S = CoverRequest.Status

# status -> set of statuses it may move to.
ALLOWED: dict[str, set[str]] = {
    S.DRAFT: {S.PENDING_APPROVAL, S.OPEN, S.CANCELLED},
    S.PENDING_APPROVAL: {S.OPEN, S.DENIED, S.CANCELLED},
    S.DENIED: {S.OPEN, S.CANCELLED},
    S.OPEN: {S.OFFERED, S.CRITICAL, S.ACCEPTED, S.CANCELLED, S.EXPIRED},
    S.OFFERED: {S.OFFERED, S.CRITICAL, S.ACCEPTED, S.CANCELLED, S.EXPIRED},
    S.CRITICAL: {S.OFFERED, S.CRITICAL, S.ACCEPTED, S.CANCELLED, S.EXPIRED},
    # Terminal states.
    S.ACCEPTED: set(),
    S.CANCELLED: set(),
    S.EXPIRED: set(),
}

# Statuses from which the request is still "live" (work can still happen).
ACTIVE_STATUSES = {S.OPEN, S.OFFERED, S.CRITICAL, S.PENDING_APPROVAL}
# Statuses where the slot is unfilled and a manager could still act.
UNFILLED_STATUSES = {S.OPEN, S.OFFERED, S.CRITICAL}


class InvalidTransition(ValueError):
    """Raised when a status change is not permitted from the current state."""


def can_transition(current: str, target: str) -> bool:
    if current == target:
        return target in ALLOWED.get(current, set())
    return target in ALLOWED.get(current, set())


def transition(cover_request: CoverRequest, target: str, actor=None, *, extra_fields=None) -> CoverRequest:
    """Move a cover request to `target`, persisting status + any extra fields.

    `extra_fields` is a dict of additional model fields to set in the same save
    (e.g. approved_by/approved_at). Raises InvalidTransition on an illegal move.
    """
    current = cover_request.status
    if target != current and not can_transition(current, target):
        raise InvalidTransition(f"Cover request {cover_request.pk}: {current} -> {target} not allowed.")

    update_fields = {"status", "updated_at"}
    cover_request.status = target
    if extra_fields:
        for field, value in extra_fields.items():
            setattr(cover_request, field, value)
            update_fields.add(field)
    if actor is not None:
        cover_request.updated_by = actor
        update_fields.add("updated_by")

    cover_request.save(update_fields=list(update_fields))
    log_audit(actor, f"cover_request.{target}", cover_request)
    return cover_request


def hours_until(cover_request: CoverRequest) -> float:
    """Hours from now until the event starts (negative if already started)."""
    delta = cover_request.timetable_event.start_datetime - timezone.now()
    return delta.total_seconds() / 3600.0


def urgency_for_hours(hours: float, critical_threshold: int) -> str:
    """Compute an urgency signal from the time remaining before the class."""
    if hours <= critical_threshold:
        return CoverRequest.Urgency.CRITICAL
    if hours <= 48:
        return CoverRequest.Urgency.HIGH
    return CoverRequest.Urgency.LOW
