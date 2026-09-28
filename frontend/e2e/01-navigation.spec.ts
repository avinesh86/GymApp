import { expect, test } from '@playwright/test'
import { goToSection, signIn } from './helpers'

/**
 * Signing in, and reaching every section from the menu.
 *
 * Deliberately the first file: everything else assumes these work, and a
 * failure here means the rest of the suite is reporting on the wrong thing.
 */
test.describe.serial('signing in and getting around', () => {
  test('an owner can sign in', async ({ page }) => {
    await signIn(page)

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    // The signed-in person is named in the sidebar footer.
    await expect(page.getByText('E2E Owner')).toBeVisible()
  })

  test('the wrong password is refused', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email address').fill('e2e-owner@example.com')
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeHidden()
  })

  // Every section an owner should be able to reach by clicking. If a menu item
  // renders but leads nowhere, this is where it shows up.
  // [menu label, heading it should land on]. They differ in places: both
  // attendance screens are headed "Attendance Entry".
  const sections: Array<[string, string]> = [
    ['Dashboard', 'Dashboard'],
    ['Timetable', 'Timetable'],
    ['Staff', 'Staff'],
    ['Cover Board', 'Cover Board'],
    ['Invoices', 'Invoices'],
    ['Attendance', 'Attendance Entry'],
    ['Bulk Attendance', 'Attendance Entry'],
    ['QR Attendance', 'QR Attendance'],
    ['Reports', 'Reports'],
    ['CSV Import', 'CSV Import'],
    ['Settings', 'Settings'],
  ]

  for (const [section, heading] of sections) {
    test(`${section} is reachable from the menu`, async ({ page }) => {
      await signIn(page)
      await goToSection(page, section, heading)

      // A page that 500s renders an error state rather than its own heading,
      // so assert nothing blew up on the way in.
      await expect(page.getByText(/Something went wrong|Couldn't load/i)).toBeHidden()
    })
  }

  test('signing out returns to the sign-in page', async ({ page }) => {
    await signIn(page)

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
