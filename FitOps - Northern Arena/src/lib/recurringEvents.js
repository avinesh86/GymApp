import moment from "moment";

/**
 * Given a base event payload, generate weekly recurring instances.
 * All share the same recurring_pattern_id.
 */
export function generateRecurringInstances(baseEventPayload, weeksAhead = 4) {
  const patternId = `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const instances = [];
  const start = moment(baseEventPayload.start_datetime);
  const end = moment(baseEventPayload.end_datetime);
  const durationMs = end.diff(start);

  for (let w = 0; w < weeksAhead; w++) {
    const s = moment(start).add(w, "weeks");
    const e = moment(s).add(durationMs, "ms");
    instances.push({
      ...baseEventPayload,
      start_datetime: s.toISOString(),
      end_datetime: e.toISOString(),
      is_recurring: true,
      recurring_pattern_id: patternId,
    });
  }
  return instances;
}