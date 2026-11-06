import { expect, test } from '@playwright/test'
import { expectToast, openSettingsTab, signIn } from './helpers'

/**
 * Two admins with the same settings open: the second Save warns instead of
 * quietly writing its older values over the first one's change.
 *
 * Both reach Settings → Invoices by clicking, in separate browser sessions.
 * The setting is put back at the end.
 */
test("Save warns when someone else changed the settings since the page opened", async ({ page, browser }) => {
  await signIn(page)
  await openSettingsTab(page, 'Invoices')
  const frequency = page.getByLabel('Invoice Frequency')
  const original = await frequency.inputValue()
  const theirs = original === 'weekly' ? 'monthly' : 'weekly'
  const theirsLabel = theirs === 'weekly' ? 'Weekly' : 'Monthly'

  // Someone else, signed in elsewhere, changes the frequency and saves.
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  try {
    await signIn(otherPage)
    await openSettingsTab(otherPage, 'Invoices')
    await otherPage.getByLabel('Invoice Frequency').selectOption(theirs)
    await otherPage.getByRole('button', { name: 'Save Invoice Settings' }).click()
    await expectToast(otherPage, 'Invoice settings saved')
  } finally {
    await other.close()
  }

  // This page still shows the frequency it opened with. Saving warns.
  await expect(frequency).toHaveValue(original)
  await page.getByRole('button', { name: 'Save Invoice Settings' }).click()
  const warning = page.getByRole('alert')
  await expect(warning).toContainText('changed by someone else')
  await expect(warning).toContainText(`Invoice Frequency (now: ${theirsLabel})`)

  await page.getByRole('button', { name: 'Load their changes' }).click()
  await expect(frequency).toHaveValue(theirs)
  await expect(warning).toBeHidden()

  // Put it back: no warning now, since this page has the latest values.
  await frequency.selectOption(original)
  await page.getByRole('button', { name: 'Save Invoice Settings' }).click()
  await expectToast(page, 'Invoice settings saved')
  await expect(page.getByRole('alert')).toBeHidden()
})
