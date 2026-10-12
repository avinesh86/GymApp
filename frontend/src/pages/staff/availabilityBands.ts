/**
 * The time bands of the availability grid, shared by every screen that shows
 * or edits one (the staff popup, the staff page, My Profile).
 *
 * They used to each define their own — Morning started at 05:00 on one screen
 * and 06:00 on another — and one of them matched saved slots by exact start
 * time. A slot ticked on My Profile then showed as unticked in the staff popup.
 * One definition, and slots are placed by the hour they start in. The bands
 * span the whole teaching day because cover matching checks a class's start
 * time against them — a 5:15am class has to fall inside Morning.
 *
 * `day_of_week` is 0 = Monday … 6 = Sunday, as the API stores it.
 */

export const AVAILABILITY_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export const AVAILABILITY_BANDS = [
  { key: 'morning',   label: 'Morning',   start: '05:00:00', end: '12:00:00' },
  { key: 'lunch',     label: 'Lunch',     start: '12:00:00', end: '14:00:00' },
  { key: 'afternoon', label: 'Afternoon', start: '14:00:00', end: '17:00:00' },
  { key: 'evening',   label: 'Evening',   start: '17:00:00', end: '23:59:00' },
] as const

export type AvailabilityBand = typeof AVAILABILITY_BANDS[number]
export type AvailabilityBandKey = AvailabilityBand['key']

/** The band a saved slot belongs to, from its start time (HH:MM or HH:MM:SS). */
export function bandForStartTime(startTime: string): AvailabilityBandKey {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 12) return 'morning'
  if (hour < 14) return 'lunch'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function availabilityCellKey(dayOfWeek: number, band: AvailabilityBandKey): string {
  return `${dayOfWeek}-${band}`
}
