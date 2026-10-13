import { expect, test, type Page } from '@playwright/test'
import { expectToast, goToSection, signIn } from './helpers'

/**
 * Recording a head count, through the one Attendance page.
 *
 * There used to be three ways in — Attendance, Bulk Attendance and QR
 * Attendance — two of them near-copies of each other. This is the journey that
 * is left: a class finishes, it shows up under Attendance, someone types the
 * number in.
 *
 * Runs last because it puts a finished class on the timetable, and the cover
 * tests before it open "the first class" expecting one that is still to come.
 */

/** The class type and location made in 02-gym-setup, whatever this run called them. */
async function chooseE2EOption(page: Page, label: string, prefix: RegExp) {
  const select = page.getByLabel(label)
  const option = select.locator('option', { hasText: prefix }).first()
  const text = (await option.textContent())?.trim() ?? ''
  expect(text, `an "${label}" made earlier in the suite should be on offer`).not.toBe('')
  await select.selectOption({ label: text })
  return text
}

/** yyyy-mm-dd for a local day, the way a date input wants it. */
function localDate(daysFromToday: number) {
  const day = new Date()
  day.setDate(day.getDate() + daysFromToday)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

const awaitingTotal = (page: Page) => page.getByText(/\d+ class(es)? awaiting attendance/)

async function readAwaitingTotal(page: Page) {
  return Number((await awaitingTotal(page).textContent())?.match(/\d+/)?.[0])
}

let classType = ''

test.describe.serial('attendance', () => {
  test('the menu has one attendance page, not three', async ({ page }) => {
    await signIn(page)

    await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bulk Attendance' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'QR Attendance' })).toHaveCount(0)
  })

  test('a class that has already finished can be put on the timetable', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await page.getByRole('button', { name: /Add Class/i }).first().click()
    classType = await chooseE2EOption(page, 'Class Type', /^E2E Aqua/)
    await chooseE2EOption(page, 'Location', /^E2E Pool/)
    // Yesterday: over, so its head count is due.
    await page.getByLabel('Date').fill(localDate(-1))
    await page.getByRole('button', { name: /^Add Class$/ }).last().click()

    await expect(page.getByText(/Failed to/i)).toBeHidden()
  })

  test('its head count can be recorded from the Attendance page', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Attendance', 'Attendance Entry')

    // Yesterday is "This Week" most days and "Last Week" on a Monday, and the
    // gym's clock need not be this browser's — so look rather than assume.
    const card = page.locator('div.rounded-xl').filter({ hasText: classType }).first()
    for (const tab of ['This Week', 'Last Week', 'Today', 'Older']) {
      await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click()
      const found = await card.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)
      if (found) break
    }
    await expect(card, 'the finished class should be awaiting a head count').toBeVisible()

    await expect(awaitingTotal(page)).not.toHaveText(/^0 /)
    const before = await readAwaitingTotal(page)

    // Nothing typed yet, so nothing to save — a stray click must not record
    // the class as empty.
    const save = card.getByRole('button', { name: 'Save Attendance' })
    await expect(save).toBeDisabled()

    await card.getByLabel('How many attendees?').fill('14')
    await save.click()
    await expectToast(page, 'Attendance saved')

    // Counted once on the way in, so it comes off the total exactly once.
    await expect(awaitingTotal(page)).toHaveText(new RegExp(`^${before - 1} `))
  })
})
