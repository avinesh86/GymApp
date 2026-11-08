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

/**
 * Signs in from the front door. The one place a URL is typed (apart from
 * opening a QR label's address, which a test reads from the label).
 *
 * `ready` is what shows once signed in: the sidebar's Dashboard link by
 * default. On a phone the sidebar is hidden, so pass the menu button instead.
 */
export async function signIn(
  page: Page,
  who = OWNER,
  ready = page.getByRole('link', { name: 'Dashboard' }),
) {
  await page.goto('/')

  // Already signed in from a previous test in the same file? The app first
  // restores a saved session behind a spinner, so wait until it shows either
  // the menu or the sign-in form; checking straight away can see neither.
  const emailField = page.getByLabel('Email address')
  await expect(ready.or(emailField).first()).toBeVisible()
  if (await ready.isVisible()) return

  await page.getByLabel('Email address').fill(who.email)
  await page.getByLabel('Password').fill(who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(ready, 'signing in should land on a page with the main menu').toBeVisible()
}

/**
 * Moves to a section by clicking its menu item, as a person would.
 *
 * `heading` is separate from the menu label because they do not always match —
 * Attendance leads to a page headed "Attendance Entry".
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
 * The day the shared test class is scheduled for: tomorrow at the gym, so it
 * is upcoming (a candidate for cover rather than for attendance).
 *
 * Fixed once per run in global-setup.ts, so every file looks for the class on
 * the day it was created, even if the run crosses midnight.
 */
export function upcomingClassDate(): Date {
  const fixed = process.env.E2E_CLASS_DATE
  if (fixed) {
    const [year, month, day] = fixed.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date
}

/** `date` as YYYY-MM-DD from its calendar fields, for date inputs. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Moves the timetable's week view forward a week, by clicking Next week, if
 * that's where `date` is.
 *
 * At most one click: the dates the tests use are this week or next, and a
 * timetable that opened on the wrong week should fail, not be walked past.
 *
 * The timetable opens on the current week. A class tomorrow is in next week's
 * view whenever today is the last day of the week (a Sunday, with weeks
 * starting on Monday), so a test that only looks at the opening week fails
 * every Sunday.
 */
export async function showWeekOf(page: Page, date: Date) {
  const dayHeader = page.locator('div.rounded-lg.p-2.text-center')
  // The week's day headers are drawn before its classes load.
  await expect(dayHeader.first(), 'the timetable should show a week').toBeVisible()
  const target = dayHeader
    .filter({ has: page.locator('p', { hasText: new RegExp(`^${WEEKDAYS[date.getDay()]}$`, 'i') }) })
    .filter({ has: page.locator('p', { hasText: new RegExp(`^${date.getDate()}$`) }) })
  // The range shown beside the arrows, e.g. "Nov 2026 · 2–8 Nov".
  const range = page.getByText(/ · \d+–\d+ /)
  if (!(await target.isVisible())) {
    const before = await range.textContent()
    await page.getByRole('button', { name: 'Next week' }).click()
    // Wait for the next week to be drawn before checking again: the range
    // changes at once, but the days are hidden while its classes load.
    await expect(range).not.toHaveText(before ?? '')
    await expect(dayHeader.first()).toBeVisible()
  }
  await expect(target, `the timetable should reach the week of ${isoDay(date)}`).toBeVisible()
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
