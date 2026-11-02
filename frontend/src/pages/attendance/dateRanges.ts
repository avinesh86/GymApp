import { startOfDay, endOfDay, startOfWeek, subWeeks, subMilliseconds } from 'date-fns'

export type DateTab = 'today' | 'this_week' | 'last_week' | 'older'

export const DATE_TABS: { key: DateTab; label: string }[] = [
  { key: 'today',     label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'older',     label: 'Older' },
]

export interface DateRange {
  from_datetime?: string
  to_datetime?: string
}

/**
 * The slice of time each tab covers, as ISO strings the API compares against
 * a class's start.
 *
 * The four tabs share out the past between them: each one ends the instant
 * before the next begins, so every class lands in exactly one tab and the tab
 * counts add up to the total. The API treats both ends as inclusive, hence the
 * millisecond stepped back from each boundary.
 *
 * "This Week" is the week so far *before* today. It used to include today,
 * which counted today's classes twice in the total, and "Older" used to stop a
 * day short of last week, which left the Sunday before it in no tab at all.
 */
export function getDateRange(tab: DateTab, now: Date = new Date()): DateRange {
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  const justBefore = (date: Date) => subMilliseconds(date, 1).toISOString()

  switch (tab) {
    case 'today':
      return {
        from_datetime: todayStart.toISOString(),
        to_datetime: endOfDay(now).toISOString(),
      }
    case 'this_week':
      // On a Monday this is empty (it ends before it starts), which is right:
      // the week so far is only today.
      return {
        from_datetime: weekStart.toISOString(),
        to_datetime: justBefore(todayStart),
      }
    case 'last_week':
      return {
        from_datetime: lastWeekStart.toISOString(),
        to_datetime: justBefore(weekStart),
      }
    case 'older':
      return { to_datetime: justBefore(lastWeekStart) }
  }
}
