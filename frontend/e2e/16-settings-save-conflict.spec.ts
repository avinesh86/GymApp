import { expect, test } from '@playwright/test'
import { expectToast, openSettingsTab, signIn } from './helpers'

/**
 * Two admins with the same settings open: the second Save warns instead of
 * quietly writing its older values over the first one's change.
 *
 * Both reach Settings → Invoices by clicking, in separate browser sessions.
 * The setting is put back at the end, even if the test fails.
 */
test('Save warns when someone else changed the settings since the page opened', async ({ page, browser }) => {
  await signIn(page)
  await openSettingsTab(page, 'Invoices')
  const frequency = page.getByLabel('Invoice Frequency')
  const original = await frequency.inputValue()
  const theirs = original === 'weekly' ? 'monthly' : 'weekly'
  const theirsLabel = theirs === 'weekly' ? 'Weekly' : 'Monthly'

  /** Sets the frequency from a fresh session, as another admin would. */
  async function asAnotherAdmin(value: string) {
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    try {
      await signIn(otherPage)
      await openSettingsTab(otherPage, 'Invoices')
      const field = otherPage.getByLabel('Invoice Frequency')
      if ((await field.inputValue()) === value) return
      await field.selectOption(value)
      await otherPage.getByRole('button', { name: 'Save Invoice Settings' }).click()
      await expectToast(otherPage, 'Invoice settings saved')
    } finally {
      await other.close()
    }
  }

  try {
    await asAnotherAdmin(theirs)

    // This page still shows the frequency it opened with. Saving warns.
    await expect(frequency).toHaveValue(original)
    await page.getByRole('button', { name: 'Save Invoice Settings' }).click()
    const warning = page.getByRole('alert')
    await expect(warning).toContainText('Someone else changed these settings')
    await expect(warning).toContainText(`Invoice Frequency (now: ${theirsLabel})`)

    await page.getByRole('button', { name: 'Use their values' }).click()
    await expect(frequency).toHaveValue(theirs)
    await expect(warning).toBeHidden()
  } finally {
    await asAnotherAdmin(original)
  }
})
