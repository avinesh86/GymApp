import { expect, test } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, named, signIn } from './helpers'

/**
 * Reports can be exported as a PDF now, or emailed on a schedule. Everything
 * is reached from the Export button on the Reports page.
 */

test.describe.serial('exporting reports', () => {
  test('a weekly report downloads as a PDF', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Reports')

    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export Report' })
    await expect(dialog.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('checkbox', { name: /Financial/ }).uncheck()

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download PDF' }).click()

    expect((await download).suggestedFilename()).toMatch(/^weekly-report-\d{4}-\d{2}-\d{2}\.pdf$/)
    await expectToast(page, 'Report downloaded')
    await expectNoErrorToast(page)
  })

  test('a scheduled report can be set up, sent now, paused and deleted', async ({ page }) => {
    const name = named('Weekly report')
    await signIn(page)
    await goToSection(page, 'Reports')
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export Report' })
    await dialog.getByRole('tab', { name: 'Email schedules' }).click()

    await dialog.getByRole('button', { name: 'New Schedule' }).click()
    const form = dialog.getByRole('form', { name: 'New schedule' })
    await form.getByLabel('Schedule name').fill(name)
    await form.getByRole('radio', { name: 'Weekly' }).click()
    await form.getByLabel('Send at').fill('18:30')
    await form.getByRole('checkbox', { name: /Financial/ }).uncheck()
    await form.getByLabel('Email to').fill('owner@example.com, manager@example.com')
    await form.getByRole('button', { name: 'Create Schedule' }).click()

    await expectToast(page, 'Schedule created')
    const row = dialog.getByTestId('report-schedule').filter({ hasText: name })
    await expect(row).toContainText('To owner@example.com, manager@example.com')
    await expect(row).toContainText('Weekly at 6:30pm')
    await expect(row).not.toContainText('Financial')

    await row.getByRole('button', { name: `Send ${name} now` }).click()
    await expectToast(page, 'Sent to 2 recipient(s).')

    await row.getByRole('button', { name: `Pause ${name}` }).click()
    await expectToast(page, 'Schedule paused')
    await expect(row).toContainText('Paused')

    await row.getByRole('button', { name: `Delete ${name}` }).click()
    await page.getByRole('dialog', { name: 'Delete schedule' }).getByRole('button', { name: 'Delete' }).click()
    await expectToast(page, 'Schedule deleted')
    await expect(row).toHaveCount(0)
    await expectNoErrorToast(page)
  })
})
