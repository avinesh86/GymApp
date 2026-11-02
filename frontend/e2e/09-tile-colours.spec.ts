import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, named, openSettingsTab, signIn } from './helpers'

/**
 * Timetable tiles take their class's colour — as a stripe, a tint or solid,
 * chosen in Settings → Timetable — and turn a pastel of their viability
 * colour once attendance is recorded. The status label stays either way.
 */

const CLASS = named('Tiles')

const bg = (el: Locator) => el.evaluate((n) => getComputedStyle(n).backgroundColor)
const stripe = (el: Locator) => el.evaluate((n) => getComputedStyle(n).borderLeftColor)

async function chooseTileStyle(page: Page, style: 'Stripe' | 'Tint' | 'Solid') {
  await openSettingsTab(page, 'Timetable')
  await page.getByRole('radio', { name: new RegExp(style) }).check()
  await page.getByRole('button', { name: 'Save Preferences' }).click()
  await expectToast(page, 'Timetable settings saved')
  await expectNoErrorToast(page)
}

/** This file's class on this week's timetable. */
const tile = (page: Page) => page.getByTestId('week-class-card').filter({ hasText: CLASS }).first()

test.describe.serial('timetable tile colours', () => {
  test('a class earlier today is added', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Classes')
    await page.getByRole('button', { name: /Add Class Type/i }).click()
    await page.getByLabel(/Name/i).first().fill(CLASS)
    await page.getByRole('button', { name: /^(Save|Add|Create)/i }).last().click()
    await expect(page.getByText(CLASS)).toBeVisible()

    await goToSection(page, 'Timetable')
    await page.getByRole('button', { name: /Add Class/i }).first().click()
    const form = page.getByRole('dialog', { name: 'Add Class' })
    await form.getByLabel('Class Type').selectOption({ label: CLASS })
    await form.getByLabel('Location').selectOption({ index: 1 })
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    await form.getByLabel('Date').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    await form.getByLabel('Start Time').fill('00:10')
    await form.getByLabel('End Time').fill('00:55')
    await page.getByRole('button', { name: /^Add Class$/ }).last().click()
    await expectNoErrorToast(page)
    await expect(tile(page)).toBeVisible()
  })

  test('Solid fills the tile with the class colour', async ({ page }) => {
    await signIn(page)
    await chooseTileStyle(page, 'Solid')
    await goToSection(page, 'Timetable')

    await expect(tile(page)).toBeVisible()
    expect(await bg(tile(page))).toBe(await stripe(tile(page)))
  })

  test('Stripe leaves the tile white', async ({ page }) => {
    await signIn(page)
    await chooseTileStyle(page, 'Stripe')
    await goToSection(page, 'Timetable')

    await expect(tile(page)).toBeVisible()
    expect(await bg(tile(page))).toBe('rgb(255, 255, 255)')
  })

  test('recording attendance turns the tile pastel, and the status stays', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')
    await expect(page.getByLabel('Viability colours')).toContainText('Once attendance is recorded')

    await tile(page).click()
    await page.getByRole('button', { name: 'Attendance', exact: true }).click()
    // New class types start amber at 6 and green at 10, so 7 is amber.
    await page.getByPlaceholder('Enter number of attendees').fill('7')
    await page.getByRole('button', { name: /Submit Attendance/ }).click()
    await expectToast(page, 'Attendance recorded')
    await page.keyboard.press('Escape')

    await expect.poll(() => bg(tile(page))).toBe('rgb(254, 243, 199)')
    await expect(tile(page)).toContainText('Completed')
  })

  test('the gym goes back to the default Tint', async ({ page }) => {
    await signIn(page)
    await chooseTileStyle(page, 'Tint')
  })
})
