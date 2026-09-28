import { expect, type Page } from '@playwright/test'

/**
 * Shared moves for the end-to-end journey.
 *
 * Everything here goes through the interface. There is deliberately no helper
 * that posts to the API or jumps to a URL — a test that reaches the Cover
 * Board by typing /cover proves the page renders, not that anyone can get to
 * it. The Accept button that shipped pointing at a route which did not exist
 * would have passed that kind of test.
 */

/** Credentials for the account the seed command creates. */
export const OWNER = {
  email: process.env.E2E_EMAIL ?? 'e2e-owner@example.com',
  password: process.env.E2E_PASSWORD ?? 'e2e-password-123',
}

/**
 * A suffix unique to this run, so repeated runs against the same database do
 * not collide and so a failure leaves evidence you can find.
 */
export const RUN_ID = process.env.E2E_RUN_ID ?? String(Date.now()).slice(-6)

export const named = (label: string) => `E2E ${label} ${RUN_ID}`

/** Signs in from the front door. The one place a URL is typed. */
export async function signIn(page: Page, who = OWNER) {
  await page.goto('/')

  // Already signed in from a previous test in the same file.
  const sidebar = page.getByRole('link', { name: 'Dashboard' })
  if (await sidebar.isVisible().catch(() => false)) return

  await page.getByLabel('Email address').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(
    page.getByRole('link', { name: 'Dashboard' }),
    'signing in should land on a page with the main menu',
  ).toBeVisible()
}

/**
 * Moves to a section by clicking its menu item, as a person would.
 *
 * `heading` is separate from the menu label because they do not always match —
 * both Attendance and Bulk Attendance lead to a page headed "Attendance
 * Entry".
 */
export async function goToSection(page: Page, label: string, heading = label) {
  await page.getByRole('link', { name: label, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: heading, exact: false }).first(),
  ).toBeVisible()
}

/** The open modal, now that it announces itself as one. */
export const dialog = (page: Page) => page.getByRole('dialog')

/** Opens one of the tabs inside Settings. */
export async function openSettingsTab(page: Page, tab: string) {
  await goToSection(page, 'Settings')
  await page.getByRole('button', { name: tab, exact: true }).click()
}

/**
 * Waits for the toast a mutation raises.
 *
 * Worth asserting on rather than skipping: a mutation that fails still leaves
 * the page looking plausible, and the error toast is often the only thing on
 * screen that says otherwise.
 */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 })
}

/** Fails loudly if an error toast appears, whatever it says. */
export async function expectNoErrorToast(page: Page) {
  await expect(
    page.getByText(/^Failed to /).first(),
    'an error toast appeared',
  ).toBeHidden()
}


/**
 * Opens the first class shown on the timetable.
 *
 * Targets the card's title element specifically. Matching the class name
 * loosely also hits the "All Classes" filter, which lists every class type as
 * an <option>.
 */
export async function openFirstClass(page: Page) {
  // The whole card carries the click handler, so target that rather than the
  // title inside it.
  const card = page.locator('div.cursor-pointer').filter({ has: page.locator('p.font-bold') }).first()
  await expect(card, 'the timetable should be showing at least one class').toBeVisible()
  await card.click()
  await expect(
    page.getByRole('button', { name: 'Manage', exact: true }),
    'clicking a class should open its detail panel',
  ).toBeVisible()
}
