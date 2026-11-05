import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * Classes that already happened can be added to the timetable.
 *
 * A recurring class started last week must fill in last week's classes, not
 * only the ones from today on. It runs every day of last week (Mon-Sun) at an
 * unusual time so its cards can be told apart from anything else.
 */

/** Last week's Monday + `offsetDays`, in the browser's local time, YYYY-MM-DD. */
function lastWeek(offsetDays = 0) {
  const d = new Date()
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday - 7 + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Class cards whose time range starts at `time` (as the card shows it, e.g. "4:35am"). */
const cardsAt = (page: Page, time: string) =>
  page.locator('div.cursor-pointer').filter({ hasText: `${time} –` })

test.describe.serial('past classes', () => {
  test('a recurring class started last week fills in last week', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await page.getByRole('button', { name: /Add Class/i }).first().click()
    const form = page.getByRole('dialog', { name: 'Add Class' })
    await form.getByLabel('Class Type').selectOption({ index: 1 })
    await form.getByLabel('Location').selectOption({ index: 1 })
    await form.getByLabel('Start Time').fill('04:35')
    await form.getByLabel('End Time').fill('05:20')

    await form.getByText('Recurring class').click()
    await form.getByLabel('Start From').fill(lastWeek())
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await form.getByRole('button', { name: day, exact: true }).click()
    }
    await form.getByLabel('End Date (optional)').fill(lastWeek(6))

    await page.getByRole('button', { name: 'Create Recurring' }).click()

    await expectToast(page, 'Created 7 recurring classes')
    await expectNoErrorToast(page)
    // Creating jumps the calendar to the class's week.
    await expect(cardsAt(page, '4:35am')).toHaveCount(7)
  })

  test('the past classes are still there when browsing back to last week', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')
    await page.getByRole('button', { name: 'Previous week' }).click()

    await expect(cardsAt(page, '4:35am')).toHaveCount(7)
  })
})
