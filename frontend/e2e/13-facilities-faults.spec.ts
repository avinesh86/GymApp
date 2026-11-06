import { expect, test, type Page } from '@playwright/test'
import { OWNER, dialog, expectNoErrorToast, expectToast, goToSection, named, openSettingsTab, signIn } from './helpers'

/**
 * Facilities, part 1. The owner adds a machine to the equipment register; an
 * instructor reports it broken from Maintenance (their staff view), sees it's already
 * reported when trying again, and later sees it fixed; the owner works the
 * fault through Maintenance. The Report a fault button can be switched off.
 *
 * The instructor login is created by seed_e2e_owner with the owner's password.
 */

const INSTRUCTOR = { email: 'e2e-instructor@example.com', password: OWNER.password }
const MACHINE = named('Rower')
const FAULT = named('Seat stuck')

async function saveFacilitiesSettings(page: Page) {
  await page.getByRole('button', { name: 'Save Facilities Settings' }).click()
  await expectToast(page, 'Facilities settings saved')
  await expectNoErrorToast(page)
}

async function setReportButton(page: Page, on: boolean) {
  await signIn(page)
  await openSettingsTab(page, 'Facilities')
  const toggle = page.getByRole('switch', { name: 'Report a fault button' })
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
  await saveFacilitiesSettings(page)
}

test.describe.serial('facilities: equipment and faults', () => {
  // The last test switches the button off and back on. If it fails in
  // between, the retry (which reruns the whole group) must not start with the
  // button off, or the instructor tests fail for the wrong reason.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await setReportButton(page, true)
    await page.close()
  })

  test('the owner adds a machine to the equipment register', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Equipment' }).click()
    await page.getByRole('button', { name: 'Add equipment' }).click()

    const form = dialog(page)
    await form.getByLabel('Name').fill(MACHINE)
    await form.getByLabel('Category').selectOption('cardio')
    await form.getByLabel('Location').fill('Cardio floor')
    await form.getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Equipment added')
    await expect(page.getByRole('cell', { name: MACHINE })).toBeVisible()
  })

  test('an instructor cannot open Facilities but can report a fault', async ({ page }) => {
    await signIn(page, INSTRUCTOR)
    await expect(page.getByRole('link', { name: 'Facilities', exact: true })).toHaveCount(0)

    await goToSection(page, 'Maintenance')
    await page.getByRole('button', { name: 'Report a fault' }).click()
    const form = dialog(page)
    await form.getByLabel('Equipment').selectOption({ label: `${MACHINE} — Cardio floor` })
    await expect(form.getByTestId('logged-by')).toHaveText('Logged by E2E Instructor')
    await form.getByLabel("What's wrong?").fill(FAULT)
    await form.getByLabel('How bad is it?').selectOption('out_of_use')
    await form.getByRole('button', { name: 'Report fault' }).click()

    await expectToast(page, 'Fault reported')
    const row = page.getByRole('list', { name: 'Open faults' }).getByRole('listitem').filter({ hasText: FAULT })
    await expect(row).toBeVisible()
    await expect(row.getByText('Do not use')).toBeVisible()
    await expect(row).toContainText('by E2E Instructor')
  })

  test('reporting the same machine again shows it is already reported', async ({ page }) => {
    await signIn(page, INSTRUCTOR)
    await goToSection(page, 'Maintenance')
    await page.getByRole('button', { name: 'Report a fault' }).click()
    const form = dialog(page)
    await form.getByLabel('Equipment').selectOption({ label: `${MACHINE} — Cardio floor` })
    const warning = form.getByTestId('already-reported')
    await expect(warning).toContainText(FAULT)
    await expect(warning).toContainText('by E2E Instructor')
    await expect(warning.getByRole('button', { name: /Me too/i })).toHaveCount(0)
    await form.getByRole('button', { name: 'Cancel' }).click()
  })

  test('the owner sees it on the dashboard and fixes it in Maintenance', async ({ page }) => {
    await signIn(page)
    // Managers work faults from Facilities; the staff page isn't in their menu.
    await expect(page.getByRole('link', { name: 'Maintenance', exact: true })).toHaveCount(0)
    await goToSection(page, 'Dashboard')
    await expect(page.getByTestId('facilities-card')).toContainText(FAULT)

    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Equipment' }).click()
    const machineRow = page.getByRole('row').filter({ hasText: MACHINE })
    await expect(machineRow).toContainText('Out of order')

    await page.getByRole('tab', { name: 'Maintenance' }).click()
    const faultRow = page.getByRole('row').filter({ hasText: FAULT })
    await expect(faultRow).toContainText('E2E Instructor')
    await faultRow.click()
    const form = dialog(page)
    await form.getByLabel('Status').selectOption('resolved')
    await form.getByLabel('Update for staff').fill('Seat replaced')
    await form.getByRole('button', { name: 'Save' }).click()
    await expectToast(page, 'Fault updated')
    await expectNoErrorToast(page)

    await page.getByRole('tab', { name: 'Equipment' }).click()
    await expect(page.getByRole('row').filter({ hasText: MACHINE })).toContainText('In service')
  })

  test('the instructor sees it fixed, with the update', async ({ page }) => {
    await signIn(page, INSTRUCTOR)
    await goToSection(page, 'Maintenance')
    const fixed = page.getByRole('list', { name: 'Recently fixed' }).getByRole('listitem').filter({ hasText: FAULT })
    await expect(fixed).toContainText('Fixed')
    await expect(fixed).toContainText('Update: Seat replaced')
  })

  test('switching the Report a fault button off hides it from instructors', async ({ page, browser }) => {
    await setReportButton(page, false)

    const instructor = await browser.newPage()
    await signIn(instructor, INSTRUCTOR)
    await expect(instructor.getByRole('link', { name: 'Maintenance', exact: true })).toHaveCount(0)
    await expect(instructor.getByRole('button', { name: 'Report a fault' })).toHaveCount(0)
    await instructor.close()

    await setReportButton(page, true)
  })
})
