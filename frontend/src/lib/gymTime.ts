/**
 * Dates and times at the gym, not in the viewer's browser.
 *
 * The API stores and sends instants in UTC. "Today", "this week", a class's
 * day and its start time all mean the gym's local calendar — the timezone
 * chosen in Settings — whoever is looking and wherever they are. A manager in
 * Sydney checking an Auckland gym, or a laptop left on UTC, must see the same
 * days the gym does.
 *
 * The trick used here: `gymNow()` returns a Date whose *local* fields
 * (getFullYear, getDate, getHours…) are the gym's wall-clock time. date-fns
 * helpers such as startOfWeek / startOfMonth / format then work on gym days
 * unchanged. `gymWallToInstant()` turns such a wall-clock Date back into the
 * real instant, for anything sent to the API as an ISO datetime.
 */
import { format, parseISO } from 'date-fns'

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** The viewer's own timezone — only a fallback until the gym's is known. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** A usable IANA zone: unknown or blank names fall back to the browser's. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return browserTimeZone()
  try {
    formatterFor(timeZone)
    return timeZone
  } catch {
    return browserTimeZone()
  }
}

interface WallParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

function wallParts(instant: Date, timeZone: string): WallParts {
  const parts: Record<string, number> = {}
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/** Milliseconds the zone is ahead of UTC at `instantMs`. */
function offsetAt(instantMs: number, timeZone: string): number {
  const w = wallParts(new Date(instantMs), timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * `instant` as the gym's wall-clock time, in a Date whose local fields are
 * that time. Use it for calendar maths and display, never send it to the API.
 */
export function gymNow(timeZone: string, instant: Date = new Date()): Date {
  const w = wallParts(instant, timeZone)
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, instant.getMilliseconds())
}

/** Today's date at the gym, as YYYY-MM-DD. */
export function gymToday(timeZone: string, instant: Date = new Date()): string {
  return format(gymNow(timeZone, instant), 'yyyy-MM-dd')
}

/**
 * The real instant at which the gym's clock reads `wall` (a Date whose local
 * fields hold the gym's wall-clock time, e.g. from gymNow + startOfDay).
 */
export function gymWallToInstant(wall: Date, timeZone: string): Date {
  const guess = Date.UTC(
    wall.getFullYear(), wall.getMonth(), wall.getDate(),
    wall.getHours(), wall.getMinutes(), wall.getSeconds(), wall.getMilliseconds(),
  )
  const first = offsetAt(guess, timeZone)
  let instant = guess - first
  // Across a DST change the offset at the answer can differ from the guess's.
  const second = offsetAt(instant, timeZone)
  if (second !== first) instant = guess - second
  return new Date(instant)
}

/** An ISO instant formatted (date-fns pattern) in the gym's timezone. */
export function formatInGym(value: string | Date, timeZone: string, pattern: string): string {
  const instant = typeof value === 'string' ? new Date(value) : value
  return format(gymNow(timeZone, instant), pattern)
}

/**
 * A plain YYYY-MM-DD date (a class's `date`, an invoice period) as a Date at
 * local midnight. `new Date('2025-11-03')` is UTC midnight, which shows as
 * 2 Nov to anyone west of UTC.
 */
export function parseDateOnly(value: string): Date {
  return parseISO(value.slice(0, 10))
}
