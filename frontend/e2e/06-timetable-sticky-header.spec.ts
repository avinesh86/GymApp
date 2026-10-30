import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * The timetable's header row — day and date in the week view, column names in
 * the list view — stays in view while the classes scroll under it.
 *
 * The file puts a class on every day of next week so both views have rows to
 * scroll, and removes them at the end. The window is kept short so they
 * overflow it.
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

/**
 * Scrolls the page's main area to the bottom, then checks the header is still
 * pinned to its top. Also checks the scroll went far enough that a header
 * which did not stick would have left the screen — otherwise the test proves
 * nothing.
 */
async function expectPinnedAfterScroll(page: Page, header: Locator) {
  const main = page.locator('main')
  const mainTop = (await main.boundingBox())!.y
  const startY = (await header.boundingBox())!.y

  await main.hover()
  await page.mouse.wheel(0, 3000)
  await expect
    .poll(() => main.evaluate((el) => el.scrollTop), 'the page should scroll the header out of its place')
    .toBeGreaterThan(startY - mainTop + 10)

  const box = (await header.boundingBox())!
  expect(box.y, 'the header should sit at the top of the scrolled area').toBeGreaterThanOrEqual(mainTop - 1)
  // Flush with the top, allowing for the padding between the header's edge
  // and the text inside it. A gap would let classes show above the header.
  expect(box.y).toBeLessThan(mainTop + 15)
}

test.describe.serial('timetable header stays in view', () => {
  test.use({ viewport: { width: 1280, height: 400 } })

  test('a class every day of next week gives the timetable rows to scroll', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await page.getByRole('button', { name: /Add Class/i }).first().click()
    const form = page.getByRole('dialog', { name: 'Add Class' })
    await form.getByLabel('Class Type').selectOption({ index: 1 })
    await form.getByLabel('Location').selectOption({ index: 1 })
    await form.getByLabel('Start Time').fill('05:35')
    await form.getByLabel('End Time').fill('06:20')

    await form.getByText('Recurring class').click()
    await form.getByLabel('Start From').fill(nextWeek())
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await form.getByRole('button', { name: day, exact: true }).click()
    }
    await form.getByLabel('End Date (optional)').fill(nextWeek(6))

    await page.getByRole('button', { name: 'Create Recurring' }).click()
    await expectToast(page, 'Created 7 recurring classes')
    await expectNoErrorToast(page)
  })

  test('week view keeps the day and date visible while scrolling', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)
    await page.getByRole('button', { name: 'Week', exact: true }).click()

    const monday = page.getByText('Mon', { exact: true }).first()
    await expect(monday).toBeVisible()

    await expectPinnedAfterScroll(page, monday)
  })

  test('list view keeps the column names visible while scrolling', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)
    await page.getByRole('button', { name: 'List', exact: true }).click()

    const classColumn = page.getByRole('columnheader', { name: 'Class', exact: true })
    await expect(classColumn).toBeVisible()
    await expect(page.getByRole('row')).not.toHaveCount(2)

    await expectPinnedAfterScroll(page, classColumn)
  })

  test('the classes are removed again', async ({ page }) => {
    await signIn(page)
    await goToNextWeek(page)
    await page.getByRole('button', { name: 'Week', exact: true }).click()

    await page.locator('div.cursor-pointer').filter({ hasText: '5:35am –' }).first().click()
    await page.getByRole('button', { name: 'Manage', exact: true }).click()
    await page.getByRole('button', { name: /Delete Permanently/ }).click()

    const scope = page.getByRole('dialog', { name: 'Delete Recurring Class' })
    await scope.getByLabel(/All classes in the series/).check()
    await scope.getByRole('button', { name: 'Delete', exact: true }).click()

    await expectToast(page, 'Deleted 7 classes from the series')
    await expectNoErrorToast(page)
  })
})
