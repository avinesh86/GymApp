import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, named, openSettingsTab, signIn } from './helpers'

/**
 * A class's viability colour follows the numbers set in Settings → Viability.
 *
 * The reported bug: Sprint set to "red under 9, amber under 20" showed a class
 * of 10 as red. Here a class type gets those numbers through the Settings
 * screen, a class earlier today records 10 people, and the timetable shows it
 * amber.
 */

const SPRINT = named('Sprint')

/** The Settings → Viability card for one class type. */
const viabilityCard = (page: Page) =>
  page.locator('div.bg-white', { has: page.getByRole('heading', { name: SPRINT, exact: true }) })

test.describe.serial('viability colours', () => {
  test('a class type is added', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Classes')

    await page.getByRole('button', { name: /Add Class Type/i }).click()
    await page.getByLabel(/Name/i).first().fill(SPRINT)
    await page.getByRole('button', { name: /^(Save|Add|Create)/i }).last().click()

    await expect(page.getByText(SPRINT)).toBeVisible()
  })

  test('Settings asks where each colour starts and shows the ranges', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Viability')

    const card = viabilityCard(page)
    await card.getByLabel('Amber starts at').fill('9')
    await card.getByLabel('Green starts at').fill('20')
    await card.getByLabel('Purple starts at').fill('30')

    await expect(card.getByText('Red 0–8')).toBeVisible()
    await expect(card.getByText('Amber 9–19')).toBeVisible()
    await expect(card.getByText('Green 20–29')).toBeVisible()
    await expect(card.getByText('Purple 30+')).toBeVisible()

    await card.getByRole('button', { name: 'Save Thresholds' }).click()
    await expectToast(page, `Thresholds saved for ${SPRINT}`)
    await expectNoErrorToast(page)
  })

  test('numbers that go backwards cannot be saved', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Viability')

    const card = viabilityCard(page)
    await expect(card.getByLabel('Amber starts at')).toHaveValue('9')
    await card.getByLabel('Green starts at').fill('5')

    await expect(card.getByRole('alert')).toContainText('Green must start at or above where amber starts')
    await expect(card.getByRole('button', { name: 'Save Thresholds' })).toBeDisabled()
  })

  test('a class of 10 shows amber on the timetable', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    // Just after midnight today, so it has already happened.
    await page.getByRole('button', { name: /Add Class/i }).first().click()
    const form = page.getByRole('dialog', { name: 'Add Class' })
    await form.getByLabel('Class Type').selectOption({ label: SPRINT })
    await form.getByLabel('Location').selectOption({ index: 1 })
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    await form.getByLabel('Date').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    await form.getByLabel('Start Time').fill('00:05')
    await form.getByLabel('End Time').fill('00:50')
    await page.getByRole('button', { name: /^Add Class$/ }).last().click()
    await expectNoErrorToast(page)

    const card = page.locator('div.cursor-pointer').filter({ hasText: SPRINT }).first()
    await card.click()
    // The class popup is not a role="dialog", so its controls are found on the page.
    await page.getByRole('button', { name: 'Attendance', exact: true }).click()
    await page.getByPlaceholder('Enter number of attendees').fill('10')
    await page.getByRole('button', { name: /Submit Attendance/ }).click()
    await expectToast(page, 'Attendance recorded')
    await expectNoErrorToast(page)

    await expect(card.getByTitle('Viability: amber')).toBeVisible()
  })
})
