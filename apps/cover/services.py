import logging
from datetime import date

from django.utils import timezone

from apps.core.audit import log_audit
from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.timetable.models import TimetableEvent

from .models import Absence, CoverOffer, CoverRequest, CoverResponse

logger = logging.getLogger(__name__)


def create_cover_request(
    timetable_event: TimetableEvent,
    absence: Absence | None,
    created_by,
    urgency: str = CoverRequest.Urgency.HIGH,
    bonus_amount=0,
) -> CoverRequest:
    """Creates a cover request for an event and flags the event as needing cover."""
    cover_request = CoverRequest.objects.create(
        tenant=timetable_event.tenant,
        timetable_event=timetable_event,
        absence=absence,
        status=CoverRequest.Status.OPEN,
        urgency=urgency,
        bonus_amount=bonus_amount,
        created_by=created_by,
        updated_by=created_by,
    )

    timetable_event.status = TimetableEvent.Status.NEEDS_COVER
    timetable_event.save(update_fields=["status", "updated_at"])

    log_audit(created_by, "create_cover_request", cover_request)
    return cover_request


def _get_time_band(hour: int) -> str:
    """Maps an hour (0-23) to a time band name."""
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 14:
        return "lunch"
    if 14 <= hour < 18:
        return "afternoon"
    return "evening"


def score_instructor_for_cover(instructor: StaffProfile, event: TimetableEvent, absent_staff_id=None) -> int | None:
    """
    Scores an instructor for a cover slot. Returns None if disqualified.

    Scoring breakdown (max ~230):
    - Qualified for class type:  +0 (required) or disqualified
    - Availability match:        +30
    - Priority tier bonus:       tier 1 → +60, tier 2 → +40, tier 3 → +20
    - Cover reliability:         up to +30
    - Role check:                instructor role required
    """
    if instructor.status != StaffProfile.Status.ACTIVE:
        return None
    if instructor.role not in ("instructor", "team_leader"):
        return None
    if absent_staff_id and instructor.pk == absent_staff_id:
        return None

    event_day = event.start_datetime.weekday()
    event_time = event.start_datetime.time()
    time_band = _get_time_band(event.start_datetime.hour)

    score = 0

    # Class type capability check
    capable = StaffClassTypeCapability.objects.filter(
        staff=instructor,
        class_type=event.class_type,
        is_active=True,
        is_deleted=False,
    ).exists()
    if not capable:
        score -= 20  # not disqualified but penalised

    # Availability check
    availability = StaffAvailability.objects.filter(
        staff=instructor,
        day_of_week=event_day,
        is_available=True,
        start_time__lte=event_time,
        end_time__gte=event_time,
        is_deleted=False,
    )
    if event.site:
        availability = availability.filter(site=event.site) | StaffAvailability.objects.filter(
            staff=instructor,
            day_of_week=event_day,
            is_available=True,
            start_time__lte=event_time,
            end_time__gte=event_time,
            site__isnull=True,
            is_deleted=False,
        )
    if availability.exists():
        score += 30

    # Priority tier bonus: tier 1 best
    tier = getattr(instructor, "priority_tier", 1) or 1
    score += (4 - tier) * 20

    # Cover reliability
    cover_reliability = float(getattr(instructor, "cover_reliability_score", instructor.reliability_score) or 0)
    score += int((cover_reliability / 100) * 30)

    return score


def build_tiered_offer_list(all_staff: list, event: TimetableEvent, absent_staff_id=None) -> dict:
    """
    Returns instructors grouped by tier, ordered by score within each tier.
    Only includes instructors with score >= 0.
    """
    scored = []
    for instructor in all_staff:
        s = score_instructor_for_cover(instructor, event, absent_staff_id)
        if s is not None and s >= 0:
            scored.append((instructor, s))

    scored.sort(key=lambda x: x[1], reverse=True)

    tiers: dict[int, list] = {1: [], 2: [], 3: []}
    for instructor, score in scored:
        tier = getattr(instructor, "priority_tier", 1) or 1
        tiers[tier].append(instructor)

    return tiers


def find_eligible_instructors(cover_request: CoverRequest) -> list:
    """
    Returns all active staff for the tenant, sorted by cover score for the event.
    Used internally; callers should use send_cover_offers for tiered dispatch.
    """
    event = cover_request.timetable_event
    absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None

    all_staff = list(
        StaffProfile.objects.filter(
            tenant=cover_request.tenant,
            status=StaffProfile.Status.ACTIVE,
            is_deleted=False,
        ).select_related()
        .prefetch_related("capabilities", "availability")
    )

    result = []
    for instructor in all_staff:
        score = score_instructor_for_cover(instructor, event, absent_staff_id)
        if score is not None and score >= 0:
            result.append(instructor)
    return result


def send_cover_offers(cover_request: CoverRequest, created_by, tier: int = 1) -> list:
    """
    Creates CoverOffer records for instructors in the given tier and triggers
    WhatsApp / email notifications.  Only sends to instructors not already offered.

    Returns the list of newly created CoverOffer instances.
    """
    event = cover_request.timetable_event
    absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None

    all_staff = list(
        StaffProfile.objects.filter(
            tenant=cover_request.tenant,
            status=StaffProfile.Status.ACTIVE,
            is_deleted=False,
        ).prefetch_related("capabilities", "availability")
    )

    tiers = build_tiered_offer_list(all_staff, event, absent_staff_id)
    target_instructors = tiers.get(tier, [])

    if not target_instructors:
        logger.warning(
            "No tier-%d instructors for cover request %s; escalating.",
            tier, cover_request.pk
        )
        return []

    already_offered_ids = set(
        CoverOffer.objects.filter(cover_request=cover_request)
        .values_list("staff_id", flat=True)
    )

    offers = []
    for instructor in target_instructors:
        if instructor.pk in already_offered_ids:
            continue
        offer = CoverOffer.objects.create(
            cover_request=cover_request,
            staff=instructor,
            tenant=cover_request.tenant,
            status=CoverOffer.Status.PENDING,
            created_by=created_by,
            updated_by=created_by,
        )
        offers.append(offer)

    if offers:
        cover_request.status = CoverRequest.Status.OFFERED
        cover_request.updated_by = created_by
        cover_request.save(update_fields=["status", "updated_by", "updated_at"])

    # Trigger async notifications
    try:
        from apps.cover.tasks import notify_cover_offers, schedule_cover_escalation
        for offer in offers:
            notify_cover_offers.delay(offer.pk)
        # Schedule escalation to next tier after 24 hours if no one accepts
        if offers and tier < 3:
            schedule_cover_escalation.apply_async(
                args=[cover_request.pk, tier + 1],
                countdown=86400,
            )
    except Exception:
        logger.exception("Failed to enqueue cover offer notifications")

    log_audit(created_by, "send_cover_offers", cover_request, after_data={"tier": tier, "offer_count": len(offers)})
    return offers


def escalate_cover_request(cover_request_id: int, next_tier: int):
    """
    Called by Celery after the offer window expires.  If the request is still
    open/offered, sends offers to the next tier or notifies admins.
    """
    try:
        cover_request = CoverRequest.objects.select_related(
            "timetable_event__class_type", "absence"
        ).get(pk=cover_request_id)
    except CoverRequest.DoesNotExist:
        return

    # Already accepted or cancelled — nothing to do
    if cover_request.status in (CoverRequest.Status.ACCEPTED, CoverRequest.Status.CANCELLED):
        return

    if next_tier <= 3:
        from apps.users.models import User
        system_user = User.objects.filter(
            tenant=cover_request.tenant, role="admin"
        ).first()
        send_cover_offers(cover_request, created_by=system_user, tier=next_tier)
    else:
        # All tiers exhausted — notify admins/team leaders
        _notify_admins_cover_unfilled(cover_request)


def _notify_admins_cover_unfilled(cover_request: CoverRequest):
    """Sends in-app notifications to all admins/team_leaders when cover is exhausted."""
    from apps.notifications.models import Notification
    from apps.users.models import User

    admin_staff = StaffProfile.objects.filter(
        tenant=cover_request.tenant,
        role__in=["admin", "gym_manager", "team_leader"],
        status=StaffProfile.Status.ACTIVE,
        is_deleted=False,
    ).select_related("user")

    event = cover_request.timetable_event
    for staff_member in admin_staff:
        if staff_member.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=staff_member.user,
                notification_type=Notification.NotificationType.SYSTEM,
                title="Cover Not Filled — Action Required",
                body=(
                    f"No instructor accepted cover for "
                    f"{event.class_type.name} on {event.start_datetime:%d %b %Y %H:%M}. "
                    f"Manual assignment required."
                ),
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )


def accept_cover_offer(cover_offer: CoverOffer, accepted_by, ip_address=None) -> CoverOffer:
    """
    Accepts a cover offer:
    - Assigns the instructor to the timetable event
    - Closes the cover request
    - Expires all other pending offers for the same request
    - Records a CoverResponse audit row
    """
    if cover_offer.status != CoverOffer.Status.PENDING:
        raise ValueError(f"Cover offer {cover_offer.pk} is not in PENDING state.")

    cover_request = cover_offer.cover_request
    event = cover_request.timetable_event

    # Assign instructor
    event.instructor = cover_offer.staff
    event.status = TimetableEvent.Status.SCHEDULED
    event.save(update_fields=["instructor", "status", "updated_at"])

    # Accept the offer
    cover_offer.status = CoverOffer.Status.ACCEPTED
    cover_offer.responded_at = timezone.now()
    cover_offer.save(update_fields=["status", "responded_at", "updated_at"])

    # Close the request
    cover_request.status = CoverRequest.Status.ACCEPTED
    cover_request.save(update_fields=["status", "updated_at"])

    # Expire other pending offers
    CoverOffer.objects.filter(
        cover_request=cover_request,
        status=CoverOffer.Status.PENDING,
    ).exclude(pk=cover_offer.pk).update(
        status=CoverOffer.Status.EXPIRED,
        responded_at=timezone.now(),
    )

    # Audit response
    CoverResponse.objects.create(
        cover_offer=cover_offer,
        action="accept",
        ip_address=ip_address,
    )

    log_audit(accepted_by, "accept_cover_offer", cover_offer)

    _notify_cover_accepted(cover_offer)

    return cover_offer


def _notify_cover_accepted(accepted_offer: CoverOffer) -> None:
    """
    After a cover offer is accepted:
    - Notifies the accepting instructor they are confirmed.
    - Notifies all other staff whose pending offers were just expired.
    """
    from apps.notifications.models import Notification

    cover_request = accepted_offer.cover_request
    event = cover_request.timetable_event
    accepting_staff = accepted_offer.staff
    event_label = f"{event.class_type.name} on {event.start_datetime.strftime('%d %b %Y at %H:%M')}"

    # Personal confirmation to the accepting instructor
    if accepting_staff.user:
        Notification.objects.create(
            tenant=cover_request.tenant,
            recipient=accepting_staff.user,
            notification_type=Notification.NotificationType.COVER_ACCEPTED,
            title="Cover confirmed — you're on!",
            body=f"You've been confirmed to cover {event_label}. See you there!",
            related_object_type="cover_offer",
            related_object_id=str(accepted_offer.pk),
        )

    # Inform all other staff that the slot has been filled
    other_expired_offers = CoverOffer.objects.filter(
        cover_request=cover_request,
        status=CoverOffer.Status.EXPIRED,
    ).exclude(pk=accepted_offer.pk).select_related("staff__user")

    for expired_offer in other_expired_offers:
        if expired_offer.staff.user:
            Notification.objects.create(
                tenant=cover_request.tenant,
                recipient=expired_offer.staff.user,
                notification_type=Notification.NotificationType.COVER_ACCEPTED,
                title="Cover slot filled",
                body=(
                    f"{accepting_staff.name} has accepted the cover for {event_label}. "
                    f"No action needed from you."
                ),
                related_object_type="cover_request",
                related_object_id=str(cover_request.pk),
            )


def process_whatsapp_cover_reply(phone_number: str, message_body: str, tenant) -> dict:
    """
    Parses an inbound WhatsApp message of the form "ACCEPT <code>" and
    accepts the matching cover offer.

    Returns a dict with keys: success, message.
    """
    parts = message_body.strip().upper().split()
    if len(parts) != 2 or parts[0] != "ACCEPT":
        return {"success": False, "message": "Unrecognised reply format."}

    accept_code = parts[1]

    try:
        offer = (
            CoverOffer.objects.select_related("cover_request__timetable_event", "staff")
            .get(
                accept_code=accept_code,
                cover_request__tenant=tenant,
                status=CoverOffer.Status.PENDING,
            )
        )
    except CoverOffer.DoesNotExist:
        return {"success": False, "message": "No matching cover offer found."}

    # Verify phone matches the staff member
    from apps.whatsapp.models import StaffWhatsAppConsent

    consent = StaffWhatsAppConsent.objects.filter(
        staff=offer.staff, phone_number=phone_number, consent_given=True, revoked_at__isnull=True
    ).first()

    if consent is None:
        return {"success": False, "message": "Phone number not recognised for this staff member."}

    accept_cover_offer(offer, accepted_by=offer.staff.created_by)
    return {"success": True, "message": f"Cover accepted for {offer.cover_request.timetable_event}."}
