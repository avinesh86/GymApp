import { expect, test, type Page } from '@playwright/test'
import { openSettingsTab, signIn } from './helpers'

/**
 * Settings tabs offer nothing to change or save until the gym's real
 * settings have arrived.
 *
 * The forms used to appear at once with made-up starting values (timezone
 * UTC, currency $, blank WhatsApp details) and fill in the real ones when the
 * request finished. Pressing Save in between wrote the made-up values over
 * the gym's settings. Here the request is held back, so the tab is caught in
 * that gap on every run rather than only on a slow connection.
 *
 * Nothing is saved, so nothing needs restoring.
 */

/** Holds GET requests to `path` until the returned function is called. */
async function holdRequests(page: Page, path: string) {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(`**/api/v1/${path}`, async (route) => {
    if (route.request().method() === 'GET') await released
    await route.continue()
  })
  return release
}

test("General shows the gym's timezone, and no Save, until it has loaded", async ({ page }) => {
  await signIn(page)
  const release = await holdRequests(page, 'tenants/settings/')

  await openSettingsTab(page, 'General')
  await expect(page.getByRole('button', { name: 'Save Timezone' })).toBeHidden()
  await expect(page.getByLabel('Timezone')).toBeHidden()

  release()

  // seed_e2e_owner sets the gym to Auckland; the old starting value was UTC.
  await expect(page.getByLabel('Timezone')).toHaveValue('Pacific/Auckland')
  await expect(page.getByRole('button', { name: 'Save Timezone' })).toBeVisible()
})

test('Notifications offers no WhatsApp Save until the WhatsApp account has loaded', async ({ page }) => {
  await signIn(page)
  const release = await holdRequests(page, 'tenants/whatsapp-account/')

  await openSettingsTab(page, 'Notifications')
  // The rest of the tab doesn't wait for WhatsApp.
  await expect(page.getByRole('button', { name: 'Save Email Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save WhatsApp Settings' })).toBeHidden()
  await expect(page.getByLabel('Business Phone Number')).toBeHidden()

  release()

  await expect(page.getByLabel('Business Phone Number')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save WhatsApp Settings' })).toBeVisible()
})

test("an open settings form keeps what's been typed once its data is 30 seconds old", async ({ page }) => {
  // The data goes out of date after 30 seconds (App.tsx staleTime). An open
  // form must not be swapped for a spinner then, losing the edit.
  test.setTimeout(90_000)
  await signIn(page)
  await openSettingsTab(page, 'General')
  await expect(page.getByLabel('Timezone')).toBeVisible()
  // Opened within 30 seconds of General, so it starts from the cached copy.
  await page.getByRole('button', { name: 'Invoices', exact: true }).click()
  const frequency = page.getByLabel('Invoice Frequency')
  const saved = await frequency.inputValue()
  const edited = saved === 'weekly' ? 'monthly' : 'weekly'
  await frequency.selectOption(edited)

  await page.waitForTimeout(35_000)

  await expect(frequency).toHaveValue(edited)
  await expect(page.getByRole('button', { name: 'Save Invoice Settings' })).toBeVisible()
})

test('a settings request that never answers ends in "Check your connection", not an endless spinner', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page)
  // Swallow the request: no answer ever comes back.
  await page.route('**/api/v1/tenants/settings/', () => {})

  await openSettingsTab(page, 'Invoices')
  await expect(page.getByText("Couldn't load the invoice settings")).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('Check your connection and try again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Invoice Settings' })).toBeHidden()
})
