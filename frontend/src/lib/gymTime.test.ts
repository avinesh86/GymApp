import { describe, it, expect } from 'vitest'
import { format, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { formatInGym, gymNow, gymToday, gymWallToInstant, parseDateOnly, safeTimeZone } from './gymTime'

const AUCKLAND = 'Pacific/Auckland'
// 9:30am Mon 1 Dec 2025 in Auckland (NZDT, UTC+13); still Sun 30 Nov in UTC.
const NZ_MORNING_ON_THE_1ST = new Date('2025-11-30T20:30:00Z')

describe('gymTime', () => {
  it("gives today's date at the gym, not in UTC or the browser", () => {
    expect(gymToday(AUCKLAND, NZ_MORNING_ON_THE_1ST)).toBe('2025-12-01')
    expect(gymToday('UTC', NZ_MORNING_ON_THE_1ST)).toBe('2025-11-30')
    expect(gymToday('America/Los_Angeles', NZ_MORNING_ON_THE_1ST)).toBe('2025-11-30')
  })

  it("puts calendar maths on the gym's wall clock", () => {
    const wall = gymNow(AUCKLAND, NZ_MORNING_ON_THE_1ST)
    expect(format(wall, 'yyyy-MM-dd HH:mm')).toBe('2025-12-01 09:30')
    expect(format(startOfMonth(wall), 'yyyy-MM-dd')).toBe('2025-12-01')
    expect(format(startOfWeek(wall, { weekStartsOn: 1 }), 'yyyy-MM-dd')).toBe('2025-12-01')
  })

  it("turns the gym's midnight back into the real instant", () => {
    const wall = gymNow(AUCKLAND, NZ_MORNING_ON_THE_1ST)
    expect(gymWallToInstant(startOfDay(wall), AUCKLAND).toISOString()).toBe('2025-11-30T11:00:00.000Z')
  })

  it('handles both sides of a daylight-saving change', () => {
    // NZ goes from +13 to +12 at 3am on 6 Apr 2025.
    expect(gymWallToInstant(new Date(2025, 3, 6, 0, 0), AUCKLAND).toISOString()).toBe('2025-04-05T11:00:00.000Z')
    expect(gymWallToInstant(new Date(2025, 3, 7, 0, 0), AUCKLAND).toISOString()).toBe('2025-04-06T12:00:00.000Z')
  })

  it('formats an ISO instant in the gym timezone', () => {
    expect(formatInGym('2025-11-30T20:00:00Z', AUCKLAND, 'EEE d MMM HH:mm')).toBe('Mon 1 Dec 09:00')
  })

  it('reads a plain date as that calendar day wherever the browser is', () => {
    expect(format(parseDateOnly('2025-11-03'), 'yyyy-MM-dd')).toBe('2025-11-03')
  })

  it('falls back to the browser zone for a missing or unknown timezone', () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(safeTimeZone(undefined)).toBe(browser)
    expect(safeTimeZone('Not/AZone')).toBe(browser)
    expect(safeTimeZone(AUCKLAND)).toBe(AUCKLAND)
  })
})
