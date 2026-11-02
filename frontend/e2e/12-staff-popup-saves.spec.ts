import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * Every tab of the staff popup has a Save Changes button, and what it saves
 * is still there after closing the popup and opening it again — the only
 * proof that counts, since a toast can appear while the data is thrown away.
 * Leaving a tab or closing with unsaved edits asks first.
 *
 * Uses the instructor the staff file added (first name "E2E").
 */

const save = (page: Page) => page.getByRole('button', { name: 'Save Changes' })

async function openInstructor(page: Page, tab: string) {
  await goToSection(page, 'Staff')
  await page.getByText(/^E2E Instructor/).first().click()
  await page.getByRole('button', { name: tab, exact: true }).click()
}

async function saveAndReopen(page: Page, toast: string | RegExp, tab: string) {
  await save(page).click()
  await expectToast(page, toast)
  await expectNoErrorToast(page)
  // The popup stays open after saving; close it and come back through the list.
  await expect(page.getByText('✓ Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await openInstructor(page, tab)
}

test.describe.serial('staff popup: every tab saves', () => {
  test('Info', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Info')
    await expect(save(page)).toBeDisabled()

    await page.getByLabel('Phone').fill('021 555 0199')
    await saveAndReopen(page, 'Staff member updated', 'Info')

    await expect(page.getByLabel('Phone')).toHaveValue('021 555 0199')
  })

  test('Availability', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Availability')

    const slot = page.getByRole('checkbox', { name: 'Wednesday Evening' })
    const before = await slot.isChecked()
    await slot.click()
    await saveAndReopen(page, 'Availability saved', 'Availability')

    await expect(page.getByRole('checkbox', { name: 'Wednesday Evening' })).toBeChecked({ checked: !before })
  })

  test('Classes', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Classes')

    const lastClass = page.locator('label', { has: page.getByRole('checkbox') }).last()
    const name = (await lastClass.innerText()).trim()
    const box = page.getByRole('checkbox', { name, exact: true })
    const before = await box.isChecked()
    await box.click()
    await saveAndReopen(page, /Classes saved/, 'Classes')

    await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked({ checked: !before })
  })

  test('Pay Rates', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Pay Rates')

    await page.getByLabel('Rate Type').selectOption('per_head')
    await page.getByLabel('Per Head Rate ($)').fill('2.75')
    await page.getByLabel('Effective From').fill('2026-01-05')
    await saveAndReopen(page, 'Pay rate saved', 'Pay Rates')

    await expect(page.getByLabel('Rate Type')).toHaveValue('per_head')
    await expect(page.getByLabel('Per Head Rate ($)')).toHaveValue('2.75')
    await expect(page.getByLabel('Effective From')).toHaveValue('2026-01-05')
  })

  test('Business & Invoice', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Business & Invoice')

    const fields: [string, string][] = [
      ['Company / Trading Name', 'E2E Fitness Ltd'],
      ['Bank Name', 'E2E Bank'],
      ['Account Name', 'E2E Instructor'],
      ['Account Number', '12-3456-7890123-00'],
      ['Sort Code', '12-34-56'],
      ['Payment Reference', 'E2E-REF'],
      ['Additional Notes', 'Pay within 7 days'],
    ]
    for (const [label, value] of fields) await page.getByLabel(label).fill(value)
    await saveAndReopen(page, 'Payment details saved', 'Business & Invoice')

    for (const [label, value] of fields) await expect(page.getByLabel(label)).toHaveValue(value)
  })

  test('leaving a tab with unsaved edits asks first', async ({ page }) => {
    await signIn(page)
    await openInstructor(page, 'Info')

    await page.getByLabel('Phone').fill('021 000 0000')
    await page.getByRole('button', { name: 'Availability', exact: true }).click()
    await expect(page.getByText('Discard unsaved changes?')).toBeVisible()

    await page.getByRole('button', { name: 'Keep editing' }).click()
    await expect(page.getByLabel('Phone')).toHaveValue('021 000 0000')

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Discard' }).click()

    // Discarded: the saved number is unchanged.
    await openInstructor(page, 'Info')
    await expect(page.getByLabel('Phone')).toHaveValue('021 555 0199')
  })
})
