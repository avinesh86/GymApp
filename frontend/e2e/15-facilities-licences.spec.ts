import { expect, test } from '@playwright/test'
import { OWNER, dialog, expectNoErrorToast, expectToast, goToSection, named, signIn } from './helpers'

/**
 * Facilities, part 3. The owner records a licence with its own reminder days
 * and a document, and a subscription with a notice period; the totals add
 * up. Instructors never see either.
 */

const INSTRUCTOR = { email: 'e2e-instructor@example.com', password: OWNER.password }
const LICENCE = named('Music licence')
const SUB = named('Booking software')

function isoInDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test.describe.serial('facilities: licences and subscriptions', () => {
  test('the owner records a licence with its own reminders and a document', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Licences' }).click()
    await page.getByRole('button', { name: 'Add licence' }).click()

    const form = dialog(page)
    await form.getByLabel('Name').fill(LICENCE)
    await form.getByLabel('Type').selectOption('music')
    await form.getByLabel('Issued by').fill('OneMusic NZ')
    await form.getByLabel('Expires on').fill(isoInDays(20))
    await form.getByLabel('Cost').fill('450')
    // Choose this licence's reminders: drop 60 days, add 14.
    await form.getByRole('button', { name: 'Remove reminder 60 days before' }).click()
    await form.getByLabel('Add a reminder (days before)').fill('14')
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(form.getByText('14 days before')).toBeVisible()
    await form.getByLabel('Attach document').setInputFiles({
      name: 'onemusic.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    })
    await form.getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Licence added')
    await expectNoErrorToast(page)
    const row = page.getByRole('row').filter({ hasText: LICENCE })
    await expect(row).toContainText('Expiring soon')
    await expect(row).toContainText('$450.00')

    await row.click()
    await expect(dialog(page).getByRole('link', { name: /onemusic/ })).toBeVisible()
    await expect(dialog(page).getByText('14 days before')).toBeVisible()
    await expect(dialog(page).getByText('60 days before')).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  })

  test('the owner records a subscription with a notice period', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Subscriptions' }).click()
    await page.getByRole('button', { name: 'Add subscription' }).click()

    const form = dialog(page)
    await form.getByLabel('Name').fill(SUB)
    await form.getByLabel('Provider').fill('Bookly')
    await form.getByLabel('Cost').fill('1200')
    await form.getByLabel('Billed').selectOption('yearly')
    await expect(form.getByText('30 days before')).toBeVisible()
    await form.getByLabel('Next renewal').fill(isoInDays(120))
    await form.getByLabel('Notice to cancel (days)').fill('60')
    await form.getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Subscription added')
    await expectNoErrorToast(page)
    const row = page.getByRole('row').filter({ hasText: SUB })
    await expect(row).toContainText('$1200.00 yearly')
    await expect(row).toContainText('Notice by')
    await expect(page.getByTestId('subscription-totals')).toContainText('Per year')
  })

  test('instructors never see licences or subscriptions', async ({ page }) => {
    await signIn(page, INSTRUCTOR)
    await expect(page.getByRole('link', { name: 'Facilities', exact: true })).toHaveCount(0)
  })
})
