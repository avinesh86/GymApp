import { expect, test } from '@playwright/test'
import { dialog, expectToast, goToSection, openSettingsTab, signIn } from './helpers'

/**
 * "Today" is the gym's today — the timezone chosen in Settings — not the
 * viewer's.
 *
 * The browser runs at UTC-12 and the gym is set to Auckland (UTC+12/+13), so
 * the two are always on different calendar days. Adding a class should start
 * on the gym's date; it used to start on the browser's.
 */

const GYM_ZONE = 'Pacific/Auckland'
const BROWSER_ZONE = 'Etc/GMT+12' // UTC-12: POSIX sign is reversed

test.use({ timezoneId: BROWSER_ZONE })

/** Today's date in `timeZone`, as YYYY-MM-DD. */
function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

test("a new class starts on the gym's today, not the browser's", async ({ page }) => {
  await signIn(page)

  await openSettingsTab(page, 'General')
  const timezone = page.getByLabel('Timezone')
  const original = await timezone.inputValue()
  await timezone.selectOption(GYM_ZONE)
  await page.getByRole('button', { name: 'Save Timezone' }).click()
  await expectToast(page, 'Settings saved')

  try {
    const gymToday = todayIn(GYM_ZONE)
    expect(gymToday, 'the two zones should be on different days, or this proves nothing')
      .not.toBe(todayIn(BROWSER_ZONE))

    await goToSection(page, 'Timetable')
    await page.getByRole('button', { name: 'Add Class' }).click()
    await expect(dialog(page).getByLabel('Date', { exact: true })).toHaveValue(gymToday)
  } finally {
    // Close the form even when the check failed, so the setting is restored.
    if (await dialog(page).isVisible().catch(() => false)) {
      await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    }
    await openSettingsTab(page, 'General')
    await page.getByLabel('Timezone').selectOption(original)
    await page.getByRole('button', { name: 'Save Timezone' }).click()
    await expectToast(page, 'Settings saved')
  }
})
