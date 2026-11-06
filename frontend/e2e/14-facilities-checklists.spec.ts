import { expect, test, type Page } from '@playwright/test'
import { format, subDays } from 'date-fns'
import { OWNER, dialog, expectNoErrorToast, expectToast, goToSection, named, signIn } from './helpers'

/**
 * Facilities, part 2. Before the gym has any checklist, the dashboard
 * invites the owner to set one up (and can be dismissed). A new machine gets
 * a QR label straight away. The owner sets up a daily checklist with a line
 * about that machine, does it from the dashboard and fails that line with a
 * photo, which raises a fault in Maintenance; the machine's service history
 * shows both. Pausing a checklist with an overdue check asks first.
 * Instructors never see checklists. Scanning the label while signed out
 * leads, after signing in, to the machine's page.
 */

const INSTRUCTOR = { email: 'e2e-instructor@example.com', password: OWNER.password }
const MACHINE = named('Bike')
const CHECKLIST = named('Opening')
const EXITS = 'Fire exits clear'
const SEAT = named('Bike seat secure')
// A real 1x1 PNG: the server decodes uploads, so it has to be an image.
const PHOTO = {
  name: 'seat.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
}
const LATE = named('Pool check')
// The address the machine's QR label opens, read from the label itself.
let qrUrl = ''

async function openChecklistList(page: Page) {
  await goToSection(page, 'Facilities')
  await page.getByRole('tab', { name: 'Checklists' }).click()
  await page.getByRole('button', { name: 'Checklists', exact: true }).click()
}

/** Untick Active and save, answering "Pause anyway" if it's asked. */
async function pauseChecklist(page: Page, row: ReturnType<Page['getByRole']>) {
  await row.click()
  const edit = page.getByRole('dialog', { name: 'Edit checklist' })
  await edit.getByRole('checkbox', { name: /Active/ }).uncheck()
  await edit.getByRole('button', { name: 'Save' }).click()
  const pauseAnyway = page.getByRole('button', { name: 'Pause anyway' })
  await expect.poll(async () => (await pauseAnyway.isVisible()) || !(await edit.isVisible())).toBe(true)
  if (await pauseAnyway.isVisible()) await pauseAnyway.click()
  await expect(edit).toBeHidden()
  await expectNoErrorToast(page)
}

test.describe.serial('facilities: checklists and equipment QR', () => {
  // The first test needs a gym with no active checklist. CI starts from an
  // empty database, but a local re-run or a retry (which reruns the whole
  // group) finds the last run's checklists, so pause them first, by clicking.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signIn(page)
    await openChecklistList(page)
    // Wait for the list (or its empty state) before counting rows.
    await expect(page.getByRole('table').or(page.getByText('No checklists yet'))).toBeVisible()
    const active = page.getByRole('row').filter({ has: page.getByText('Active', { exact: true }) })
    while ((await active.count()) > 0) await pauseChecklist(page, active.first())
    await page.close()
  })

  test('before any checklist exists, the owner is invited to set one up', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Dashboard')
    const prompt = page.getByTestId('checks-setup-prompt')
    await expect(prompt.getByRole('heading', { name: 'Checks to do' })).toBeVisible()
    await expect(prompt).toContainText('Set up opening, cleaning or safety checklists for your team')
    await expect(page.getByTestId('checks-card')).toHaveCount(0)

    await prompt.getByRole('button', { name: 'Set up a checklist' }).click()
    await expect(page.getByRole('heading', { name: 'Facilities' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Checklists' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Add checklist' })).toBeVisible()

    // Dismissed, it stays gone when they come back through the front door.
    await goToSection(page, 'Dashboard')
    await page.getByRole('button', { name: 'Dismiss checklist setup' }).click()
    await expect(prompt).toHaveCount(0)
    await signIn(page)
    await expect(page.getByTestId('facilities-card')).toBeVisible() // facilities settings have loaded
    await expect(prompt).toHaveCount(0)
  })

  test('a new machine gets a QR label to print', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Equipment' }).click()
    await page.getByRole('button', { name: 'Add equipment' }).click()
    await dialog(page).getByLabel('Name').fill(MACHINE)
    await dialog(page).getByLabel('Asset tag').fill('NA-0042')
    await dialog(page).getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'its QR label is ready to print')
    const qr = dialog(page).getByTestId('equipment-qr')
    await expect(qr).toBeVisible()
    qrUrl = (await qr.getAttribute('data-qr-url')) ?? ''
    expect(qrUrl).toMatch(/\/equipment\/\d+$/)
    await expect(dialog(page).getByRole('button', { name: 'Print label' })).toBeEnabled()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  })

  test('the owner sets up a daily checklist', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Checklists' }).click()
    await page.getByRole('button', { name: 'Add checklist' }).click()

    const form = dialog(page)
    await form.getByLabel('Name').fill(CHECKLIST)
    await form.getByLabel('Type').selectOption('opening')
    await form.getByLabel('Frequency').selectOption('daily')
    await form.getByLabel('Done by').fill('23:59')
    await form.getByLabel('Item 1', { exact: true }).fill(EXITS)
    await form.getByRole('button', { name: 'Add item' }).click()
    await form.getByLabel('Item 2', { exact: true }).fill(SEAT)
    await form.getByLabel('Machine for item 2').selectOption({ label: MACHINE })
    await form.getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Checklist added')
    await expectNoErrorToast(page)
    await page.getByRole('button', { name: 'Checklists', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: CHECKLIST })).toContainText('Daily, by 11:59pm')
  })

  test('doing the check from the dashboard; a fail goes to Maintenance', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Dashboard')
    const card = page.getByTestId('checks-card')
    await card.getByRole('button', { name: `Start: ${CHECKLIST}` }).click()

    const check = dialog(page)
    await expect(check.getByRole('button', { name: 'Finish check' })).toBeDisabled()
    await check.getByRole('group', { name: EXITS }).getByRole('button', { name: 'Pass' }).click()
    await check.getByRole('group', { name: SEAT }).getByRole('button', { name: 'Fail' }).click()
    await check.getByLabel(`What's wrong: ${SEAT}`).fill('Seat post loose')
    await check.getByLabel(`Photo: ${SEAT}`).setInputFiles(PHOTO)
    await check.getByRole('button', { name: 'Finish check' }).click()

    await expectToast(page, 'Check done — 1 problem sent to Maintenance')
    await expectNoErrorToast(page)
    await expect(card.getByRole('button', { name: `Start: ${CHECKLIST}` })).toHaveCount(0)
    await expect(page.getByTestId('checks-setup-prompt')).toHaveCount(0)

    // The card's link opens the Checklists tab, not the first Facilities tab.
    await card.getByRole('button', { name: /View all checks/ }).click()
    await expect(page.getByRole('tab', { name: 'Checklists' })).toHaveAttribute('aria-selected', 'true')

    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Maintenance' }).click()
    await expect(page.getByRole('row').filter({ hasText: SEAT })).toContainText(MACHINE)
  })

  test('the check is in History and the machine shows its service history', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Checklists' }).click()
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: CHECKLIST })).toContainText('E2E Owner')

    await page.getByRole('tab', { name: 'Equipment' }).click()
    await page.getByRole('row').filter({ hasText: MACHINE }).click()
    await dialog(page).getByRole('button', { name: 'Service history' }).click()

    await expect(page.getByRole('heading', { name: MACHINE })).toBeVisible()
    const history = page.getByRole('list', { name: 'Service history' })
    await expect(history).toContainText(CHECKLIST)
    await expect(history).toContainText('Seat post loose')
    await expect(history.getByRole('link', { name: 'photo' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Open faults' })).toContainText(SEAT)
    // The QR label opens this same page.
    expect(page.url()).toBe(qrUrl)
  })

  test('pausing a checklist with an overdue check asks first', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Facilities')
    await page.getByRole('tab', { name: 'Checklists' }).click()
    await page.getByRole('button', { name: 'Add checklist' }).click()
    const form = dialog(page)
    await form.getByLabel('Name').fill(LATE)
    await form.getByLabel('Frequency').selectOption('daily')
    // Due by midnight, so today's check is already overdue.
    await form.getByLabel('Done by').fill('00:00')
    await form.getByLabel('Starting').fill(format(subDays(new Date(), 2), 'yyyy-MM-dd'))
    await form.getByLabel('Item 1', { exact: true }).fill('Chlorine level checked')
    await form.getByRole('button', { name: 'Save' }).click()
    await expectToast(page, 'Checklist added')

    await goToSection(page, 'Dashboard')
    const card = page.getByTestId('checks-card')
    await expect(card.getByRole('button', { name: `Start: ${LATE}` })).toBeVisible()

    await openChecklistList(page)
    await page.getByRole('row').filter({ hasText: LATE }).click()
    const edit = page.getByRole('dialog', { name: 'Edit checklist' })
    await edit.getByRole('checkbox', { name: /Active/ }).uncheck()
    await edit.getByRole('button', { name: 'Save' }).click()

    const confirm = page.getByRole('dialog', { name: 'Pause this checklist?' })
    await expect(confirm).toContainText('1 overdue check will be dropped from the dashboard and overdue alerts. Pause anyway?')
    await confirm.getByRole('button', { name: 'Keep it active' }).click()
    await expect(confirm).toBeHidden()
    await expect(edit).toBeVisible() // nothing saved yet

    await edit.getByRole('button', { name: 'Save' }).click()
    await confirm.getByRole('button', { name: 'Pause anyway' }).click()
    await expectToast(page, 'Checklist saved')
    await expectNoErrorToast(page)
    await expect(page.getByRole('row').filter({ hasText: LATE })).toContainText('Paused')

    await goToSection(page, 'Dashboard')
    await expect(page.getByTestId('checks-card')).toBeVisible()
    await expect(card.getByRole('button', { name: `Start: ${LATE}` })).toHaveCount(0)
  })

  test('instructors never see checklists', async ({ page }) => {
    await signIn(page, INSTRUCTOR)
    await expect(page.getByRole('link', { name: 'Facilities', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('checks-card')).toHaveCount(0)
  })

  test('scanning the QR label while signed out: sign in, land on the machine', async ({ page }) => {
    // Scanning a label is the one journey where a person really does arrive
    // by address: their phone opens what the QR code holds. The address comes
    // from the label in the first test, not from this test.
    expect(qrUrl).not.toBe('')
    await page.goto(qrUrl)
    await page.getByLabel('Email address').fill(INSTRUCTOR.email)
    await page.getByLabel('Password').fill(INSTRUCTOR.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('heading', { name: MACHINE })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Open faults' })).toContainText(SEAT)
    await expect(page.getByRole('button', { name: 'Report a fault' })).toBeVisible()
    // Service history is for Facilities roles only.
    await expect(page.getByRole('list', { name: 'Service history' })).toHaveCount(0)
  })
})
