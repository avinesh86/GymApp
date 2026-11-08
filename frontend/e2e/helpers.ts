import { expect, type Page } from '@playwright/test'
import { format } from 'date-fns'

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
 * The gym's timezone. `seed_e2e_owner` gives the test gym this zone, and the
 * timetable shows weeks and "today" in it.
 */
export const GYM_TIMEZONE = 'Pacific/Auckland'

/**
 * The gym's calendar date `days` from today, as YYYY-MM-DD (what a date input
 * takes).
 *
 * Worked out in the gym's zone, not this Node process's. On CI the process
 * runs in UTC, which is on the previous day for the first half of every
 * Auckland day, and `new Date()` there gives UTC's date.
 */
export function gymDate(days = 0, now: Date = new Date()): string {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number)
  // Plain calendar arithmetic: UTC has no daylight saving to skip a day.
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * The day the suite's class goes on (03 creates it, 04 asks for cover on it):
 * tomorrow at the gym, so it is upcoming — a candidate for cover rather than
 * for attendance.
 *
 * On a Sunday that is next week's Monday, so look for it with `showWeekOf`.
 */
export const upcomingClassDate = (now: Date = new Date()) => gymDate(1, now)

const DAY_MS = 24 * 60 * 60 * 1000

/** The Monday starting the timetable week that holds `date` (weeks start on Monday). */
function mondayOf(date: string): Date {
  const day = new Date(`${date}T00:00:00Z`)
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS)
}

/** Weeks between the gym's current week and the one holding `date`: 0 this week, 1 next. */
export function weeksFromThisWeek(date: string, now: Date = new Date()): number {
  return Math.round((mondayOf(date).getTime() - mondayOf(gymDate(0, now)).getTime()) / (7 * DAY_MS))
}

/**
 * The timetable's heading for the week holding `date`, e.g. "Nov 2026 · 9–15 Nov",
 * built with the same date-fns patterns as TimetablePage.
 */
export function weekLabel(date: string): string {
  const monday = mondayOf(date)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  // date-fns formats in this process's zone; local-midnight copies of the UTC
  // days keep the calendar dates whatever that zone is.
  const local = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return `${format(local(monday), 'MMM yyyy')} · ${format(local(monday), 'd')}–${format(local(sunday), 'd MMM')}`
}

/**
 * Moves the open timetable to the week holding `date`, by clicking its own
 * week arrows, then checks the heading says so.
 *
 * The timetable opens on the gym's current week. A class made for "tomorrow"
 * on a Sunday is in next week, so without this a test looking for it finds an
 * empty week every Sunday.
 */
export async function showWeekOf(page: Page, date: string, now: Date = new Date()) {
  const weeks = weeksFromThisWeek(date, now)
  const arrow = page.getByRole('button', { name: weeks > 0 ? 'Next week' : 'Previous week' })
  for (let i = 0; i < Math.abs(weeks); i++) await arrow.click()
  await expect(
    page.getByText(weekLabel(date), { exact: true }),
    `the timetable should be showing the week of ${date}`,
  ).toBeVisible()
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
