/**
 * Cover Matching Service
 * Handles automated instructor matching, tiered offers, reminders & escalation.
 */
import { base44 } from "@/api/base44Client";
import moment from "moment";

/**
 * Compute which time band a datetime falls in.
 */
export function getTimeBand(datetime) {
  const h = moment(datetime).hour();
  if (h < 12) return "morning";
  if (h < 14) return "lunch";
  if (h < 17) return "afternoon";
  return "evening";
}

/**
 * Get the day-of-week key for availability lookup.
 */
export function getDayKey(datetime) {
  return moment(datetime).format("dddd").toLowerCase();
}

/**
 * Score an instructor for a given event.
 * Returns null if disqualified, otherwise a numeric score (higher = better match).
 */
export function scoreInstructor(instructor, event, classType) {
  // Must be active instructor
  if (instructor.status !== "active") return null;
  if (!["instructor", "team_leader"].includes(instructor.role)) return null;

  // Skip if they are the one who needs cover
  if (instructor.id === event.original_instructor_id) return null;

  let score = 0;

  // 1. Qualification check (not hard-blocked in this demo, but penalise if mismatched)
  if (classType?.required_qualifications?.length > 0 && instructor.qualifications?.length > 0) {
    const hasQual = classType.required_qualifications.some(q => instructor.qualifications.includes(q));
    if (!hasQual) return null; // Hard disqualify
  }

  // 2. Class type eligibility (if set)
  if (instructor.classes_can_teach?.length > 0 && event.class_type_id) {
    if (!instructor.classes_can_teach.includes(event.class_type_id)) score -= 20;
  }

  // 3. Availability preference
  const day = getDayKey(event.start_datetime);
  const band = getTimeBand(event.start_datetime);
  const dayPrefs = instructor.availability_preferences?.[day] || [];
  if (dayPrefs.includes(band)) score += 30;

  // 4. Priority tier (tier 1 = best)
  const tier = instructor.priority_tier || 2;
  score += (4 - tier) * 20; // tier1 → +60, tier2 → +40, tier3 → +20

  // 5. Reliability score
  score += (instructor.cover_reliability_score || 100) * 0.3;

  return score;
}

/**
 * Build ordered list of instructors to offer cover, grouped by tier.
 */
export function buildOfferList(allStaff, event, classType) {
  const scored = allStaff
    .map(s => ({ instructor: s, score: scoreInstructor(s, event, classType) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => b.score - a.score);

  // Group into tiers
  const tiers = {};
  scored.forEach(({ instructor }) => {
    const t = instructor.priority_tier || 2;
    if (!tiers[t]) tiers[t] = [];
    tiers[t].push(instructor);
  });

  return { scored, tiers };
}

/**
 * Send cover offers to tier 1 instructors.
 * Creates notification records and updates the cover request.
 */
export async function dispatchCoverOffers(coverRequest, allStaff, classType, coverRequestId) {
  const { tiers } = buildOfferList(allStaff, {
    ...coverRequest.event_details,
    id: coverRequest.event_id,
    original_instructor_id: coverRequest.original_instructor_id,
    class_type_id: classType?.id,
  }, classType);

  const tier1 = tiers[1] || [];
  const tier2 = tiers[2] || [];
  const tier3 = tiers[3] || [];

  const firstTier = tier1.length > 0 ? tier1 : (tier2.length > 0 ? tier2 : tier3);
  const tierNum = tier1.length > 0 ? 1 : (tier2.length > 0 ? 2 : 3);

  const offersSent = [];
  const eligibleIds = [];

  for (const instructor of firstTier) {
    eligibleIds.push(instructor.id);
    offersSent.push({
      instructor_id: instructor.id,
      instructor_name: instructor.name,
      sent_at: new Date().toISOString(),
      tier: tierNum,
      response: null,
      response_at: null,
    });

    // Create in-app notification
    await base44.entities.Notification.create({
      recipient_id: instructor.id,
      recipient_email: instructor.email,
      type: "cover_request",
      title: "Cover Request Available",
      message: `${coverRequest.event_details?.class_type_name} on ${moment(coverRequest.event_details?.start_datetime).format("ddd, MMM D")} at ${moment(coverRequest.event_details?.start_datetime).format("h:mm A")} needs covering.${coverRequest.bonus_amount > 0 ? ` Bonus: $${coverRequest.bonus_amount}` : ""}`,
      link: "/CoverBoard",
      is_urgent: ["critical", "high"].includes(coverRequest.urgency),
      related_entity_type: "CoverRequest",
      related_entity_id: coverRequestId,
    });
  }

  // Update cover request with offer list
  await base44.entities.CoverRequest.update(coverRequestId, {
    eligible_instructor_ids: eligibleIds,
    offers_sent: offersSent,
    current_offer_tier: tierNum,
    status: "offered",
  });

  return { offersSent, tierNum, eligibleIds };
}

/**
 * Escalate to next tier if no response.
 */
export async function escalateCoverRequest(coverRequest, coverRequestId, allStaff, classType) {
  const currentTier = coverRequest.current_offer_tier || 1;
  const nextTier = currentTier + 1;

  const { tiers } = buildOfferList(allStaff, {
    ...coverRequest.event_details,
    id: coverRequest.event_id,
    original_instructor_id: coverRequest.original_instructor_id,
    class_type_id: classType?.id,
  }, classType);

  const nextInstructors = tiers[nextTier] || [];

  if (nextInstructors.length === 0) {
    // No more tiers - notify admins/team leaders
    const leaders = allStaff.filter(s => ["admin", "gym_manager", "team_leader"].includes(s.role));
    for (const leader of leaders) {
      await base44.entities.Notification.create({
        recipient_id: leader.id,
        recipient_email: leader.email,
        type: "cover_request",
        title: "⚠ Cover Request Unresolved",
        message: `No instructor has accepted coverage for ${coverRequest.event_details?.class_type_name} on ${moment(coverRequest.event_details?.start_datetime).format("ddd, MMM D")}. Manual assignment required.`,
        link: "/CoverBoard",
        is_urgent: true,
        related_entity_type: "CoverRequest",
        related_entity_id: coverRequestId,
      });
    }
    return { escalated: false, reason: "No more tiers, admins notified" };
  }

  const newOffers = [...(coverRequest.offers_sent || [])];
  const eligibleIds = [];

  for (const instructor of nextInstructors) {
    eligibleIds.push(instructor.id);
    newOffers.push({
      instructor_id: instructor.id,
      instructor_name: instructor.name,
      sent_at: new Date().toISOString(),
      tier: nextTier,
      response: null,
    });

    await base44.entities.Notification.create({
      recipient_id: instructor.id,
      recipient_email: instructor.email,
      type: "cover_request",
      title: "Cover Request - Reminder",
      message: `Still needed: ${coverRequest.event_details?.class_type_name} on ${moment(coverRequest.event_details?.start_datetime).format("ddd, MMM D")}. Can you help?`,
      link: "/CoverBoard",
      is_urgent: true,
      related_entity_type: "CoverRequest",
      related_entity_id: coverRequestId,
    });
  }

  await base44.entities.CoverRequest.update(coverRequestId, {
    eligible_instructor_ids: eligibleIds,
    offers_sent: newOffers,
    current_offer_tier: nextTier,
  });

  return { escalated: true, nextTier, count: nextInstructors.length };

}