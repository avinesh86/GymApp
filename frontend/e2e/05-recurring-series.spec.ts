import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * A recurring class can be edited and deleted as a series, or one class at a
 * time.
 *
 * The class runs every day of next week (Mon-Sun) at an unusual time, so the
 * whole series sits in one week of the calendar and its cards can be told
 * apart from anything earlier files put on the timetable. Each step reaches
 * the class by clicking through to next week and clicking its card.
 */

/** Next week's Monday + `offsetDays`, in the browser's local time, YYYY-MM-DD. */
function nextWeek(offsetDays = 0) {
  const d = new Date()
  const daysToMonday = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + daysToMonday + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function goToNextWeek(page: Page) {
  await goToSection(page, 'Timetable')
  await page.getByRole('button', { name: 'Next week' }).click()
}

/** Class cards whose time range starts at `time` (as the card shows it, e.g. "5:05am"). */
const cardsAt = (page: Page, time: string) =>
  page.locator('div.cursor-pointer').filter({ hasText: `${time} –` })

async function openCardAt(page: Page, time: string) {
  await cardsAt(page, time).first().click()
  await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeVisible()
}

test.describe.serial('recurring classes', () => {
  test('a recurring class can be created for a week', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await page.getByRole('button', { name: /Add Class/i }).first().click()
    const form = page.getByRole('dialog', { name: 'Add Class' })
    await form.getByLabel('Class Type').selectOption({ index: 1 })
    await form.getByLabel('Location').selectOption({ index: 1 })
    await form.getByLabel('Start Time').fill('05:05')
    await form.getByLabel('End Time').fill('05:50')

    await form.getByText('Recurring class').click()
    await form.getByLabel('Start From').fill(nextWeek())
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await form.getByRole('button', { name: day, exact: true }).click()
    }
    await form.getByLabel('End Date (optional)').fill(nextWeek(6))

    await page.getByRole('button', { name: 'Create Recurring' }).click()

    await expectToast(page, 'Created 7 recurring classes')
    await expectNoErrorToast(page)
    // Creating jumps the calendar to the class's week.
    await expect(cardsAt(page, '5:05am')).toHaveCount(7)
  })

  test('editing one class leaves the rest of the series alone', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)

    await openCardAt(page, '5:05am')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Start Time').fill('05:10')
    await page.getByRole('button', { name: /Save Changes/ }).click()

    const scope = page.getByRole('dialog', { name: 'Save Recurring Class' })
    await expect(scope.getByLabel(/This class only/)).toBeChecked()
    await scope.getByRole('button', { name: 'Save', exact: true }).click()

    await expectToast(page, 'Class updated')
    await expectNoErrorToast(page)
    await expect(cardsAt(page, '5:10am')).toHaveCount(1)
    await expect(cardsAt(page, '5:05am')).toHaveCount(6)
  })

  test('editing the whole series moves every class', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)

    await openCardAt(page, '5:05am')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Start Time').fill('05:20')
    await page.getByRole('button', { name: /Save Changes/ }).click()

    const scope = page.getByRole('dialog', { name: 'Save Recurring Class' })
    await scope.getByLabel(/All classes in the series/).check()
    await scope.getByRole('button', { name: 'Save', exact: true }).click()

    await expectToast(page, 'Updated 7 classes in the series')
    await expectNoErrorToast(page)
    await expect(cardsAt(page, '5:20am')).toHaveCount(7)
    await expect(cardsAt(page, '5:05am')).toHaveCount(0)
    await expect(cardsAt(page, '5:10am')).toHaveCount(0)
  })

  test('deleting one class keeps the rest of the series', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)

    await openCardAt(page, '5:20am')
    await page.getByRole('button', { name: 'Manage', exact: true }).click()
    await page.getByRole('button', { name: /Delete Permanently/ }).click()

    const scope = page.getByRole('dialog', { name: 'Delete Recurring Class' })
    await expect(scope.getByLabel(/This class only/)).toBeChecked()
    await scope.getByRole('button', { name: 'Delete', exact: true }).click()

    await expectToast(page, 'Class deleted')
    await expectNoErrorToast(page)
    await expect(cardsAt(page, '5:20am')).toHaveCount(6)
  })

  test('deleting the whole series removes every class', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)

    await openCardAt(page, '5:20am')
    await page.getByRole('button', { name: 'Manage', exact: true }).click()
    await page.getByRole('button', { name: /Delete Permanently/ }).click()

    const scope = page.getByRole('dialog', { name: 'Delete Recurring Class' })
    await scope.getByLabel(/All classes in the series/).check()
    await scope.getByRole('button', { name: 'Delete', exact: true }).click()

    await expectToast(page, 'Deleted 6 classes from the series')
    await expectNoErrorToast(page)
    await expect(cardsAt(page, '5:20am')).toHaveCount(0)
  })
})
