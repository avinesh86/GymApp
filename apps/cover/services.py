import logging

from django.utils import timezone

from apps.core.audit import log_audit
from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.timetable.models import TimetableEvent

from . import notifications
from .models import Absence, CoverOffer, CoverRequest, CoverResponse
from .state import transition, urgency_for_hours

logger = logging.getLogger(__name__)

S = CoverRequest.Status


def _tenant_settings(tenant):
    return getattr(tenant, "settings", None)


def _critical_threshold(tenant) -> int:
    settings = _tenant_settings(tenant)
    return getattr(settings, "cover_critical_threshold_hours", 4) or 4


def _auto_dispatch_enabled(tenant) -> bool:
    settings = _tenant_settings(tenant)
    # Default to True so gyms without explicit settings keep auto-dispatch.
    return getattr(settings, "cover_auto_dispatch", True)


def create_cover_request(
    timetable_event: TimetableEvent,
    absence: Absence | None,
    created_by,
    urgency: str | None = None,
    bonus_amount=0,
    requested_by=None,
    initial_status: str = S.OPEN,
) -> CoverRequest:
    """Creates a cover request for an event and flags the event as needing cover.

    `urgency` is auto-computed from the time remaining before the class when not
    supplied. `initial_status` lets the caller open immediately (default) or hold
    for approval (PENDING_APPROVAL). `requested_by` is the instructor for
    self-service requests, otherwise the acting manager.
    """
    if urgency is None:
        urgency = urgency_for_hours(
            (timetable_event.start_datetime - timezone.now()).total_seconds() / 3600.0,
            _critical_threshold(timetable_event.tenant),
        )

    cover_request = CoverRequest.objects.create(
        tenant=timetable_event.tenant,
        timetable_event=timetable_event,
        absence=absence,
        status=initial_status,
        urgency=urgency,
        bonus_amount=bonus_amount or 0,
        requested_by=requested_by or created_by,
        created_by=created_by,
        updated_by=created_by,
    )

    timetable_event.status = TimetableEvent.Status.NEEDS_COVER
    timetable_event.save(update_fields=["status", "updated_at"])

    log_audit(created_by, "create_cover_request", cover_request)
    return cover_request


def initial_status_for_tenant(tenant) -> str:
    """OPEN when auto-dispatch is on, otherwise PENDING_APPROVAL (manager-gated)."""
    return S.OPEN if _auto_dispatch_enabled(tenant) else S.PENDING_APPROVAL


def submit_cover_request(cover_request: CoverRequest, actor) -> CoverRequest:
    """Act on a freshly created request based on the status the caller chose.

    OPEN (auto-dispatch) → send Tier-1 offers. PENDING_APPROVAL (manager-gated)
    → notify managers. Always confirms to the requester.
    """
    notifications.notify_request_submitted(cover_request)

    if cover_request.status == S.OPEN:
        send_cover_offers(cover_request, created_by=actor, tier=1)
    elif cover_request.status == S.PENDING_APPROVAL:
        notifications.notify_managers_pending_approval(cover_request)
    return cover_request


def approve_cover_request(cover_request: CoverRequest, actor) -> CoverRequest:
    """Manager approves a pending request → open it and dispatch Tier-1 offers."""
    transition(
        cover_request,
        S.OPEN,
        actor,
        extra_fields={"approved_by": actor, "approved_at": timezone.now()},
    )
    send_cover_offers(cover_request, created_by=actor, tier=1)
    return cover_request


def deny_cover_request(cover_request: CoverRequest, actor, reason: str = "") -> CoverRequest:
    """Manager denies a pending request. The event stays needing manual handling."""
    return transition(
        cover_request,
        S.DENIED,
        actor,
        extra_fields={"cancellation_reason": reason or ""},
    )


def _get_time_band(hour: int) -> str:
    """Maps an hour (0-23) to a time band name."""
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 14:
        return "lunch"
    if 14 <= hour < 18:
        return "afternoon"
    return "evening"


def is_eligible_for_cover(instructor: StaffProfile, event: TimetableEvent, absent_staff_id=None) -> bool:
    """Hard eligibility gate (doc: qualification + role + active + not the absentee).

    Qualification is required here — unlike scoring, an instructor who cannot
    teach the class type is never offered the cover.
    """
    if instructor.status != StaffProfile.Status.ACTIVE:
        return False
    if instructor.role not in ("instructor", "team_leader"):
        return False
    if absent_staff_id and instructor.pk == absent_staff_id:
        return False
    return StaffClassTypeCapability.objects.filter(
        staff=instructor,
        class_type=event.class_type,
        is_active=True,
        is_deleted=False,
    ).exists()


def score_instructor_for_cover(instructor: StaffProfile, event: TimetableEvent, absent_staff_id=None) -> int | None:
    """
    Scores an instructor for ranking within the eligible set. Returns None if
    hard-disqualified (inactive / wrong role / the absentee). Lacking the class
    capability is penalised here but eligibility is enforced separately by
    is_eligible_for_cover (the doc's qualification gate).
    """
    if instructor.status != StaffProfile.Status.ACTIVE:
        return None
    if instructor.role not in ("instructor", "team_leader"):
        return None
    if absent_staff_id and instructor.pk == absent_staff_id:
        return None

    event_day = event.start_datetime.weekday()
    event_time = event.start_datetime.time()

    score = 0

    capable = StaffClassTypeCapability.objects.filter(
        staff=instructor,
        class_type=event.class_type,
        is_active=True,
        is_deleted=False,
    ).exists()
    if not capable:
        score -= 20

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

    tier = getattr(instructor, "priority_tier", 1) or 1
    score += (4 - tier) * 20

    cover_reliability = float(getattr(instructor, "cover_reliability_score", instructor.reliability_score) or 0)
    score += int((cover_reliability / 100) * 30)

    return score


def build_tiered_offer_list(all_staff: list, event: TimetableEvent, absent_staff_id=None) -> dict:
    """
    Returns eligible instructors grouped by priority tier, ranked by score within
    each tier. Only instructors that pass the hard eligibility gate are included.
    """
    scored = []
    for instructor in all_staff:
        if not is_eligible_for_cover(instructor, event, absent_staff_id):
            continue
        s = score_instructor_for_cover(instructor, event, absent_staff_id)
        if s is not None:
            scored.append((instructor, s))

    scored.sort(key=lambda x: x[1], reverse=True)

    tiers: dict[int, list] = {1: [], 2: [], 3: []}
    for instructor, _score in scored:
        tier = getattr(instructor, "priority_tier", 1) or 1
        tiers.setdefault(tier, []).append(instructor)
    return tiers


def _all_active_staff(tenant) -> list:
    return list(
        StaffProfile.objects.filter(
            tenant=tenant,
            status=StaffProfile.Status.ACTIVE,
            is_deleted=False,
        ).prefetch_related("capabilities", "availability")
    )


def find_eligible_instructors(cover_request: CoverRequest) -> list:
    """All eligible instructors for the request's event (qualification + role)."""
    event = cover_request.timetable_event
    absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None
    return [
        i for i in _all_active_staff(cover_request.tenant)
        if is_eligible_for_cover(i, event, absent_staff_id)
    ]


def get_cover_candidates(cover_request: CoverRequest) -> dict:
    """Tiered, ranked candidate list for the manager review screen."""
    event = cover_request.timetable_event
    absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None
    return build_tiered_offer_list(_all_active_staff(cover_request.tenant), event, absent_staff_id)


def _create_offers(cover_request: CoverRequest, instructors: list, created_by) -> list:
    """Create PENDING offers for instructors not already offered; flip to OFFERED."""
    already_offered_ids = set(
        CoverOffer.objects.filter(cover_request=cover_request).values_list("staff_id", flat=True)
    )
    offers = []
    for instructor in instructors:
        if instructor.pk in already_offered_ids:
            continue
        offers.append(
            CoverOffer.objects.create(
                cover_request=cover_request,
                staff=instructor,
                tenant=cover_request.tenant,
                status=CoverOffer.Status.PENDING,
                created_by=created_by,
                updated_by=created_by,
            )
        )

    if offers and cover_request.status != S.OFFERED:
        # OPEN/CRITICAL → OFFERED (CRITICAL stays critical-urgency but is dispatchable).
        transition(cover_request, S.OFFERED, created_by)

    try:
        from apps.cover.tasks import notify_cover_offers
        for offer in offers:
            notify_cover_offers.delay(offer.pk)
    except Exception:
        logger.exception("Failed to enqueue cover offer notifications")

    log_audit(created_by, "send_cover_offers", cover_request, after_data={"offer_count": len(offers)})
    return offers


def send_cover_offers(cover_request: CoverRequest, created_by, tier: int = 1) -> list:
    """Create offers for the given tier's eligible instructors and notify them."""
    event = cover_request.timetable_event
    absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None
    tiers = build_tiered_offer_list(_all_active_staff(cover_request.tenant), event, absent_staff_id)
    target = tiers.get(tier, [])
    if not target:
        logger.warning("No tier-%d instructors for cover request %s.", tier, cover_request.pk)
        return []
    return _create_offers(cover_request, target, created_by)


def dispatch_cover_offers(cover_request: CoverRequest, created_by, staff_ids: list | None = None, tier: int = 1) -> list:
    """Manual dispatch: offer to a manager-chosen set of staff, or fall back to a tier."""
    if staff_ids:
        event = cover_request.timetable_event
        absent_staff_id = cover_request.absence.staff_id if cover_request.absence else None
        chosen = [
            i for i in _all_active_staff(cover_request.tenant)
            if i.pk in set(staff_ids) and is_eligible_for_cover(i, event, absent_staff_id)
        ]
        return _create_offers(cover_request, chosen, created_by)
    return send_cover_offers(cover_request, created_by, tier=tier)


def escalate_cover_request(cover_request_id: int, next_tier: int):
    """Dispatch the next tier, or notify admins when all tiers are exhausted."""
    try:
        cover_request = CoverRequest.objects.select_related(
            "timetable_event__class_type", "absence"
        ).get(pk=cover_request_id)
    except CoverRequest.DoesNotExist:
        return

    if cover_request.status in (S.ACCEPTED, S.CANCELLED, S.DENIED, S.EXPIRED):
        return

    if next_tier <= 3:
        from apps.users.models import User
        system_user = User.objects.filter(tenant=cover_request.tenant, role="admin").first()
        offers = send_cover_offers(cover_request, created_by=system_user, tier=next_tier)
        if not offers:
            # Nobody left in this tier — keep climbing.
            escalate_cover_request(cover_request_id, next_tier + 1)
    else:
        notifications.notify_admins_unfilled(cover_request)


def accept_cover_offer(cover_offer: CoverOffer, accepted_by, ip_address=None) -> CoverOffer:
    """
    Accepts a cover offer: assigns the cover instructor (retaining the original
    as SUB), closes the request, expires sibling offers, and audits the response.
    """
    if cover_offer.status != CoverOffer.Status.PENDING:
        raise ValueError(f"Cover offer {cover_offer.pk} is not in PENDING state.")

    cover_request = cover_offer.cover_request
    event = cover_request.timetable_event

    # Retain who was originally scheduled, so the timetable can show "SUB: <name>".
    if event.original_instructor_id is None and event.instructor_id and event.instructor_id != cover_offer.staff_id:
        event.original_instructor = event.instructor
    event.instructor = cover_offer.staff
    event.status = TimetableEvent.Status.SCHEDULED
    event.save(update_fields=["instructor", "original_instructor", "status", "updated_at"])

    cover_offer.status = CoverOffer.Status.ACCEPTED
    cover_offer.responded_at = timezone.now()
    cover_offer.save(update_fields=["status", "responded_at", "updated_at"])

    transition(
        cover_request,
        S.ACCEPTED,
        accepted_by,
        extra_fields={"accepted_by": cover_offer.staff, "accepted_at": timezone.now()},
    )

    CoverOffer.objects.filter(
        cover_request=cover_request,
        status=CoverOffer.Status.PENDING,
    ).exclude(pk=cover_offer.pk).update(
        status=CoverOffer.Status.EXPIRED,
        responded_at=timezone.now(),
    )

    CoverResponse.objects.create(cover_offer=cover_offer, action="accept", ip_address=ip_address)
    log_audit(accepted_by, "accept_cover_offer", cover_offer)
    notifications.notify_cover_accepted(cover_offer)
    return cover_offer


def process_whatsapp_cover_reply(phone_number: str, message_body: str, tenant) -> dict:
    """Parses 'ACCEPT <code>' and accepts the matching offer."""
    parts = message_body.strip().upper().split()
    if len(parts) != 2 or parts[0] != "ACCEPT":
        return {"success": False, "message": "Unrecognised reply format."}

    accept_code = parts[1]
    try:
        offer = (
            CoverOffer.objects.select_related("cover_request__timetable_event", "staff")
            .get(accept_code=accept_code, cover_request__tenant=tenant, status=CoverOffer.Status.PENDING)
        )
    except CoverOffer.DoesNotExist:
        return {"success": False, "message": "No matching cover offer found."}

    from apps.whatsapp.models import StaffWhatsAppConsent

    consent = StaffWhatsAppConsent.objects.filter(
        staff=offer.staff, phone_number=phone_number, consent_given=True, revoked_at__isnull=True
    ).first()
    if consent is None:
        return {"success": False, "message": "Phone number not recognised for this staff member."}

    accept_cover_offer(offer, accepted_by=offer.staff.created_by)
    return {"success": True, "message": f"Cover accepted for {offer.cover_request.timetable_event}."}
