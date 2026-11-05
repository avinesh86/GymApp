import { describe, it, expect } from 'vitest'
import { DATE_TABS, getDateRange, type DateTab } from './dateRanges'

/** Which tabs a class starting at `start` shows under — the API's own test. */
function tabsShowing(start: Date, now: Date): DateTab[] {
  const iso = start.toISOString()
  return DATE_TABS.map((tab) => tab.key).filter((key) => {
    const { from_datetime, to_datetime } = getDateRange(key, now)
    return (!from_datetime || iso >= from_datetime) && (!to_datetime || iso <= to_datetime)
  })
}

// Wednesday 14 October 2026, mid-morning. Last week began Monday 5 October.
const WEDNESDAY = new Date(2026, 9, 14, 10, 30)

describe('attendance tab date ranges', () => {
  it('does not count a class from today under This Week as well', () => {
    // They used to appear under both, so the header total counted them twice.
    expect(tabsShowing(new Date(2026, 9, 14, 6, 0), WEDNESDAY)).toEqual(['today'])
  })

  it('puts the Sunday before last week under Older', () => {
    // Older used to stop at the start of that Sunday and Last Week began on
    // the Monday, so the day between belonged to no tab.
    expect(tabsShowing(new Date(2026, 9, 4, 9, 0), WEDNESDAY)).toEqual(['older'])
    expect(tabsShowing(new Date(2026, 9, 4, 23, 59, 59, 999), WEDNESDAY)).toEqual(['older'])
  })

  it('gives every moment of the past to exactly one tab', () => {
    const boundaries = [
      new Date(2026, 9, 14, 0, 0),  // today begins
      new Date(2026, 9, 12, 0, 0),  // this week begins
      new Date(2026, 9, 5, 0, 0),   // last week begins
    ]
    for (const boundary of boundaries) {
      for (const offsetMs of [-1, 0, 1]) {
        const moment = new Date(boundary.getTime() + offsetMs)
        expect(tabsShowing(moment, WEDNESDAY), moment.toString()).toHaveLength(1)
      }
    }
  })

  it('sorts earlier days of the week, last week and beyond into their tabs', () => {
    expect(tabsShowing(new Date(2026, 9, 13, 18, 0), WEDNESDAY)).toEqual(['this_week'])
    expect(tabsShowing(new Date(2026, 9, 11, 18, 0), WEDNESDAY)).toEqual(['last_week'])
    expect(tabsShowing(new Date(2026, 9, 5, 0, 0), WEDNESDAY)).toEqual(['last_week'])
    expect(tabsShowing(new Date(2026, 8, 1, 9, 0), WEDNESDAY)).toEqual(['older'])
  })

  it('leaves This Week empty on a Monday, when the week so far is only today', () => {
    const monday = new Date(2026, 9, 12, 15, 0)
    expect(tabsShowing(new Date(2026, 9, 12, 9, 0), monday)).toEqual(['today'])
    expect(tabsShowing(new Date(2026, 9, 11, 9, 0), monday)).toEqual(['last_week'])
  })
})

describe("attendance tab date ranges in the gym's timezone", () => {
  // 9:30am Mon 1 Dec 2025 in Auckland; still Sunday 30 Nov in UTC and in
  // most browsers outside NZ.
  const NOW = new Date('2025-11-30T20:30:00Z')
  const AUCKLAND = 'Pacific/Auckland'

  it("starts Today at the gym's midnight", () => {
    expect(getDateRange('today', NOW, AUCKLAND)).toEqual({
      from_datetime: '2025-11-30T11:00:00.000Z',
      to_datetime: '2025-12-01T10:59:59.999Z',
    })
  })

  it("puts a 6am class today under Today, whatever the viewer's clock says", () => {
    const sixAm = '2025-11-30T17:00:00.000Z' // 6am 1 Dec in Auckland
    const { from_datetime, to_datetime } = getDateRange('today', NOW, AUCKLAND)
    expect(sixAm >= from_datetime! && sixAm <= to_datetime!).toBe(true)
  })

  it("starts Last Week on the gym's Monday", () => {
    expect(getDateRange('last_week', NOW, AUCKLAND).from_datetime).toBe('2025-11-23T11:00:00.000Z')
  })
})

describe('attendance tab date ranges follow the gym, not the browser', () => {
  // Same moment, two gyms: only the gym's own timezone can satisfy both.
  const NOW = new Date('2025-11-30T20:30:00Z')

  it('starts Today at Los Angeles midnight for a Los Angeles gym', () => {
    expect(getDateRange('today', NOW, 'America/Los_Angeles')).toEqual({
      from_datetime: '2025-11-30T08:00:00.000Z',
      to_datetime: '2025-12-01T07:59:59.999Z',
    })
  })

  it('starts Today at Auckland midnight for an Auckland gym', () => {
    expect(getDateRange('today', NOW, 'Pacific/Auckland').from_datetime).toBe('2025-11-30T11:00:00.000Z')
  })
})
