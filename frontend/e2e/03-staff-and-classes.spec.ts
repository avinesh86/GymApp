import { expect, test } from '@playwright/test'
import { expectToast, goToSection, named, signIn } from './helpers'

/**
 * Adding an instructor, qualifying them, and putting a class on the timetable.
 *
 * The qualification step is the one that matters. Cover is only ever offered
 * to instructors ticked for that class type, and nothing warns you when none
 * are — the request simply reaches nobody. Production had three active staff
 * and no capabilities recorded, which is exactly this.
 */

const FIRST_NAME = 'E2E'
const LAST_NAME = named('Instructor').replace('E2E ', '')
const FULL_NAME = `${FIRST_NAME} ${LAST_NAME}`
const EMAIL = `e2e-instructor-${Date.now()}@example.com`

/** The class type the timetable test picked, so the next test can look for it. */
let scheduledClassType = ''

test.describe.serial('staff and the timetable', () => {
  test('an instructor can be added and qualified in one go', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Staff')

    await page.getByRole('button', { name: /Add Staff/i }).first().click()

    await page.getByLabel('First Name').fill(FIRST_NAME)
    await page.getByLabel('Last Name').fill(LAST_NAME)
    await page.getByLabel('Email').fill(EMAIL)
    await page.getByLabel('Role').selectOption({ label: 'Instructor' })

    // "Classes can teach" is on the creation form, so there is no excuse for
    // an instructor to exist without one. Tick the first available.
    const firstQualification = page.getByRole('checkbox').first()
    await expect(
      firstQualification,
      'the add-staff form should offer the gym\'s class types',
    ).toBeVisible()
    await firstQualification.check()

    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText(FULL_NAME).first()).toBeVisible()
  })

  test('the qualification was saved, not just ticked', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Staff')

    await page.getByText(FULL_NAME).first().click()
    await page.getByRole('button', { name: 'Classes', exact: true }).click()

    await expect(
      page.getByRole('checkbox', { checked: true }).first(),
      'the class type ticked when adding them should still be ticked',
    ).toBeVisible()
  })

  test('edits in the staff popup are still there after saving', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Staff')

    // "Staff member updated" used to appear while the priority tier and the
    // status were thrown away, so the toast alone proves nothing. Save, close,
    // come back, and look.
    await page.getByText(FULL_NAME).first().click()
    await page.getByLabel('Priority Tier').selectOption({ label: 'Tier 3' })
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Inactive' })
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expectToast(page, 'Staff member updated')

    // An inactive member leaves the default (active) list — itself a sign the
    // status was stored.
    await page.getByLabel('Filter by status').selectOption({ label: 'Inactive' })
    await page.getByText(FULL_NAME).first().click()
    await expect(
      page.getByLabel('Priority Tier'),
      'the priority tier chosen before saving should still be selected',
    ).toHaveValue('3')
    await expect(
      page.getByLabel('Status', { exact: true }),
      'the status chosen before saving should still be selected',
    ).toHaveValue('inactive')

    // Back to active: cover is only offered to active instructors, and the
    // tests after this one need this instructor to receive an offer.
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Active' })
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.getByLabel('Filter by status').selectOption({ label: 'Active' })
    await expect(page.getByText(FULL_NAME).first()).toBeVisible()
  })

  test('a class can be added to the timetable', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await page.getByRole('button', { name: /Add Class/i }).first().click()

    await page.getByLabel('Class Type').selectOption({ index: 1 })
    await page.getByLabel('Location').selectOption({ index: 1 })

    // Remember what was chosen so the next test can find it on the board.
    scheduledClassType =
      (await page.getByLabel('Class Type').locator('option:checked').textContent())?.trim() ?? ''
    expect(scheduledClassType, 'a class type should have been selected').not.toBe('')

    // Tomorrow: upcoming, so it is a candidate for cover rather than for
    // attendance.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await page.getByLabel('Date').fill(tomorrow.toISOString().slice(0, 10))

    await page.getByRole('button', { name: /^Add Class$/ }).last().click()

    await expect(page.getByText(/Failed to/i)).toBeHidden()
  })

  test('the new class shows on the timetable', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    // Scoped to a paragraph so it matches the card title rather than the
    // filter dropdown, which lists every class type as an <option>.
    await expect(
      page.locator('p', { hasText: scheduledClassType }).first(),
    ).toBeVisible()
  })
})
