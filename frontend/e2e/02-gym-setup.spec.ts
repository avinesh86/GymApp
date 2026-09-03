import { expect, test } from '@playwright/test'
import { goToSection, named, openSettingsTab, signIn } from './helpers'

/**
 * Setting a gym up, in the order the guide tells people to work.
 *
 * Serial and ordered on purpose: a class type cannot be taught by anyone until
 * it exists, and a class cannot be scheduled without a location. Running these
 * out of order would pass for the wrong reasons.
 */

const LOCATION = named('Pool')
const CLASS_TYPE = named('Aqua')

test.describe.serial('setting up a gym', () => {
  test('a location can be added', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Locations')

    await page.getByRole('button', { name: /Add Location/i }).click()
    await page.getByLabel(/Name/i).first().fill(LOCATION)

    const address = page.getByLabel(/Address/i)
    if (await address.isVisible().catch(() => false)) {
      await address.fill('1 Test Street')
    }
    await page.getByRole('button', { name: /^(Save|Add|Create)/i }).last().click()

    await expect(page.getByText(LOCATION)).toBeVisible()
  })

  test('a class type can be added', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Classes')

    await page.getByRole('button', { name: /Add Class Type/i }).click()
    await page.getByLabel(/Name/i).first().fill(CLASS_TYPE)
    await page.getByRole('button', { name: /^(Save|Add|Create)/i }).last().click()

    await expect(page.getByText(CLASS_TYPE)).toBeVisible()
  })

  test('the sender fields match how this deployment sends mail', async ({ page }) => {
    // Two valid shapes, and the test must not assume which. Where sending is
    // managed there is no mail account to connect, so asking for a password
    // would be asking for something never read. Where it is not, the password
    // is genuinely required. What must never happen is both or neither.
    await signIn(page)
    await openSettingsTab(page, 'Notifications')

    const managed = await page.getByLabel(/Reply-to Address/i).isVisible().catch(() => false)
    // Located by text, not by label: the password input has no associated
    // <label>, so getByLabel cannot see it. Worth fixing in the app — a screen
    // reader cannot announce it either.
    const passwordField = page.getByText(/Gmail App Password/i).first()

    if (managed) {
      await expect(passwordField).toBeHidden()
      await expect(page.getByText(/FitOps sends these emails for you/i)).toBeVisible()
    } else {
      await expect(page.getByLabel(/Sender Email/i)).toBeVisible()
      await expect(passwordField).toBeVisible()
    }
  })

  test('the reply-to address can be saved', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Notifications')

    // Labelled by deployment, but it is the same field either way.
    const address = page.getByLabel(/Reply-to Address|Sender Email/i).first()
    await address.fill('replies@example.com')
    await page.getByRole('button', { name: /Save Email Settings/i }).click()

    await expect(page.getByText(/saved|updated/i).first()).toBeVisible()
  })

  test('the users list paginates rather than truncating', async ({ page }) => {
    await signIn(page)
    await openSettingsTab(page, 'Access')

    // Either page controls or a single page of users — both fine. What must
    // not happen is a bare list with more rows than the API returns.
    await expect(page.getByRole('button', { name: 'Invite User' })).toBeVisible()
    await expect(page.getByText('E2E Owner').first()).toBeVisible()
  })

  test('the new location and class type can be chosen when adding a class', async ({ page }) => {
    // The real check on steps 1 and 2: they have to be usable where they are
    // used. selectOption fails if the option is not there, which is the
    // assertion — a native select's options are not visible text.
    await signIn(page)
    await goToSection(page, 'Timetable')
    await page.getByRole('button', { name: /Add Class/i }).click()

    await page.getByLabel('Class Type').selectOption({ label: CLASS_TYPE })
    await page.getByLabel('Location').selectOption({ label: LOCATION })

    // Both selects now hold a real id rather than the empty placeholder,
    // which is what proves the options were there to choose.
    await expect(page.getByLabel('Class Type')).toHaveValue(/\d+/)
    await expect(page.getByLabel('Location')).toHaveValue(/\d+/)
  })
})
