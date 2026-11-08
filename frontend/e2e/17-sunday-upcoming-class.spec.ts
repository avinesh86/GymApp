import { expect, test } from '@playwright/test'
import {
  gymDate,
  goToSection,
  showWeekOf,
  signIn,
  upcomingClassDate,
  weekLabel,
  weeksFromThisWeek,
} from './helpers'

/**
 * A class made for "tomorrow" on a Sunday can still be found on the timetable.
 *
 * The timetable opens on the gym's current week, Monday to Sunday. On a Sunday
 * tomorrow is next week's Monday, and the cover tests (03, 04) failed every
 * Sunday because they looked for it in this week. They also worked out
 * "tomorrow" from this Node process's clock — UTC on CI — rather than the
 * gym's, which is a different day for half of every Auckland day.
 *
 * These pin both down: the date sums at the awkward moments, then the whole
 * thing in a browser whose clock says it is Sunday evening at the gym.
 */

/** 08:49 UTC is 20:49 or 21:49 the same day in Auckland, with or without daylight saving. */
const at0849Utc = (date: string) => new Date(`${date}T08:49:00Z`)

test.describe('working out the class day in the gym\'s timezone', () => {
  test('Sunday evening at the gym: tomorrow is Monday, in next week', () => {
    // When CI failed: Sunday 8 Nov 2026, 21:49 in Auckland.
    const now = at0849Utc('2026-11-08')
    expect(gymDate(0, now)).toBe('2026-11-08')
    expect(upcomingClassDate(now)).toBe('2026-11-09')
    expect(weeksFromThisWeek(upcomingClassDate(now), now)).toBe(1)
  })

  test('Saturday afternoon in UTC is already Sunday at the gym', () => {
    // 12:00 UTC Saturday = 01:00 Sunday in Auckland. UTC's "tomorrow" would be
    // Sunday — the gym's today, not its tomorrow.
    const now = new Date('2026-11-07T12:00:00Z')
    expect(gymDate(0, now)).toBe('2026-11-08')
    expect(upcomingClassDate(now)).toBe('2026-11-09')
    expect(weeksFromThisWeek(upcomingClassDate(now), now)).toBe(1)
  })

  test('midweek, tomorrow stays in this week', () => {
    const now = at0849Utc('2026-11-04') // Wednesday
    expect(upcomingClassDate(now)).toBe('2026-11-05')
    expect(weeksFromThisWeek(upcomingClassDate(now), now)).toBe(0)
  })

  test('across a month, a year and a daylight-saving change', () => {
    expect(gymDate(1, at0849Utc('2026-12-31'))).toBe('2027-01-01')
    // Auckland's clocks went back on Sunday 5 April 2026.
    expect(gymDate(1, new Date('2026-04-04T12:30:00Z'))).toBe('2026-04-06')
    expect(weekLabel('2026-12-31')).toBe('Dec 2026 · 28–3 Jan')
    expect(weekLabel('2026-11-09')).toBe('Nov 2026 · 9–15 Nov')
  })
})

test.describe('on the timetable, with the browser\'s clock on a Sunday evening', () => {
  test('a class made for tomorrow shows once you move to next week', async ({ page }) => {
    // A Sunday well clear of the weeks other files use, so this class cannot
    // turn up in their timetables. The reset clears it like any other E2E class.
    const today = gymDate(0)
    const daysToSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7
    const sunday = gymDate(daysToSunday + 12 * 7)
    const now = at0849Utc(sunday)
    await page.clock.setFixedTime(now)

    await signIn(page)
    await goToSection(page, 'Timetable')
    await expect(
      page.getByText(weekLabel(sunday), { exact: true }),
      'the timetable should open on the (faked) current week',
    ).toBeVisible()

    await page.getByRole('button', { name: /Add Class/i }).first().click()
    await page.getByLabel('Class Type').selectOption({ index: 1 })
    await page.getByLabel('Location').selectOption({ index: 1 })
    const classType =
      (await page.getByLabel('Class Type').locator('option:checked').textContent())?.trim() ?? ''
    expect(classType, 'a class type should have been selected').not.toBe('')
    const tomorrow = upcomingClassDate(now)
    await page.getByLabel('Date').fill(tomorrow)
    await page.getByRole('button', { name: /^Add Class$/ }).last().click()
    await expect(page.getByText(/Failed to/i)).toBeHidden()

    // Come back the way a person would: the timetable opens on this week,
    // which does not have it.
    await goToSection(page, 'Dashboard')
    await goToSection(page, 'Timetable')
    const card = page.locator('p', { hasText: classType }).first()
    await expect(page.getByText(weekLabel(sunday), { exact: true })).toBeVisible()
    // The colour key renders only once the week's classes have loaded, so the
    // next check cannot pass just because nothing has arrived yet.
    await expect(page.getByLabel('Viability colours')).toBeVisible()
    await expect(card, 'a Monday class is not in the week ending Sunday').toBeHidden()

    await showWeekOf(page, tomorrow, now)
    await expect(card, 'the class should be in next week').toBeVisible()
  })
})
