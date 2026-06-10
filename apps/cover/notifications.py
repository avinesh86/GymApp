"""
Cover-workflow notifications.

Centralises the in-app Notifications raised across the cover lifecycle so the
services stay thin. WhatsApp/email offer notifications stay in tasks.py
(notify_cover_offers); these are the in-app records for the rest of the flow.
"""
from __future__ import annotations

import logging

from apps.notifications.models import Notification
from apps.staff.models import StaffProfile

logger = logging.getLogger(__name__)


def _event_label(event) -> str:
    return f"{event.class_type.name} on {event.start_datetime:%d %b %Y at %H:%M}"


def _managers(tenant):
    """Active admins / gym managers / team leaders with a linked login."""
    return StaffProfile.objects.filter(
        tenant=tenant,
        role__in=["admin", "gym_manager", "team_leader"],
        status=StaffProfile.Status.ACTIVE,
        is_deleted=False,
    ).select_related("user")


def notify_request_submitted(cover_request) -> None:
    """Confirmation to the instructor who raised the request."""
    user = cover_request.requested_by
    if not user:
        return
    event = cover_request.timetable_event
    Notification.objects.create(
        tenant=cover_request.tenant,
        recipient=user,
        notification_type=Notification.NotificationType.SYSTEM,
        title="Cover request received",
        body=f"Your cover request for {_event_label(event)} has been received.",
        related_object_type="cover_request",
        related_object_id=str(cover_request.pk),
    )


def notify_managers_pending_approval(cover_request) -> None:
    """Tell managers a request is waiting for approval."""
    event = cover_request.timetable_event
    for staff_member in _managers(cover_request.tenant):
        if staff_member.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=staff_member.user,
                notification_type=Notification.NotificationType.SYSTEM,
                title="Cover request awaiting approval",
                body=f"A cover request for {_event_label(event)} needs your approval.",
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )


def notify_critical(cover_request) -> None:
    """Alert managers that a request has gone critical (close to class time)."""
    event = cover_request.timetable_event
    for staff_member in _managers(cover_request.tenant):
        if staff_member.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=staff_member.user,
                notification_type=Notification.NotificationType.SYSTEM,
                title="CRITICAL: cover still unfilled",
                body=f"Cover for {_event_label(event)} is critical and still unfilled.",
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )


def notify_cover_accepted(accepted_offer) -> None:
    """
    After acceptance: confirm the cover instructor, tell the original
    instructor and managers, and inform the other (now-expired) candidates.
    """
    cover_request = accepted_offer.cover_request
    event = cover_request.timetable_event
    accepting_staff = accepted_offer.staff
    label = _event_label(event)

    # The cover instructor.
    if accepting_staff.user:
        Notification.objects.create(
            tenant=cover_request.tenant,
            recipient=accepting_staff.user,
            notification_type=Notification.NotificationType.COVER_ACCEPTED,
            title="Cover confirmed — you're on!",
            body=f"You've been confirmed to cover {label}. See you there!",
            related_object_type="cover_offer",
            related_object_id=str(accepted_offer.pk),
        )

    # The original instructor (whose class is now covered).
    original = event.original_instructor
    if original and original.user and original.pk != accepting_staff.pk:
        Notification.objects.create(
            tenant=cover_request.tenant,
            recipient=original.user,
            notification_type=Notification.NotificationType.COVER_ACCEPTED,
            title="Your class is covered",
            body=f"{accepting_staff.name} is covering {label}.",
            related_object_type="cover_request",
            related_object_id=str(cover_request.pk),
        )

    # Managers.
    for staff_member in _managers(cover_request.tenant):
        if staff_member.user and staff_member.pk not in (accepting_staff.pk, getattr(original, "pk", None)):
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=staff_member.user,
                notification_type=Notification.NotificationType.COVER_ACCEPTED,
                title="Cover filled",
                body=f"{accepting_staff.name} accepted cover for {label}.",
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )

    # Other candidates whose offers were expired by the acceptance.
    from .models import CoverOffer

    others = CoverOffer.objects.filter(
        cover_request=cover_request,
        status=CoverOffer.Status.EXPIRED,
    ).exclude(pk=accepted_offer.pk).select_related("staff__user")
    for expired in others:
        if expired.staff.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=expired.staff.user,
                notification_type=Notification.NotificationType.COVER_ACCEPTED,
                title="Cover slot filled",
                body=f"{accepting_staff.name} has accepted the cover for {label}. No action needed.",
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )


def notify_admins_unfilled(cover_request) -> None:
    """All tiers exhausted — managers must assign manually."""
    event = cover_request.timetable_event
    for staff_member in _managers(cover_request.tenant):
        if staff_member.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=staff_member.user,
                notification_type=Notification.NotificationType.SYSTEM,
                title="Cover Not Filled — Action Required",
                body=f"No instructor accepted cover for {_event_label(event)}. Manual assignment required.",
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )
