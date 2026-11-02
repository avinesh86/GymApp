import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * Reports can leave out chosen classes (e.g. virtual classes). The choice is
 * saved for the gym, shared by the Attendance, Classes and Viability tabs,
 * and still there after leaving Reports and coming back.
 */

const pickerButton = (page: Page) => page.getByRole('button', { name: /(All classes|\d+ of \d+ classes)/ })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Classes in reports' })

async function openReportsTab(page: Page, tab: string) {
  await goToSection(page, 'Reports')
  await page.getByRole('button', { name: tab, exact: true }).click()
}

test.describe.serial('report class filter', () => {
  test('a class can be left out of the reports', async ({ page }) => {
    await signIn(page)
    await openReportsTab(page, 'Attendance')
    await expect(pickerButton(page)).toHaveText('All classes')

    await pickerButton(page).click()
    const boxes = panel(page).getByRole('checkbox')
    const total = await boxes.count()
    expect(total, 'the gym should have class types to choose from').toBeGreaterThan(1)
    await boxes.first().uncheck()
    await panel(page).getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Report classes saved')
    await expectNoErrorToast(page)
    await expect(pickerButton(page)).toHaveText(`${total - 1} of ${total} classes`)
  })

  test('the choice is shared by the Classes and Viability tabs and remembered', async ({ page }) => {
    await signIn(page)
    // Leave Reports entirely, then come back through the menu.
    await goToSection(page, 'Timetable')
    await openReportsTab(page, 'Classes')
    await expect(pickerButton(page)).toHaveText(/\d+ of \d+ classes/)

    await page.getByRole('button', { name: 'Viability', exact: true }).click()
    await expect(pickerButton(page)).toHaveText(/\d+ of \d+ classes/)
  })

  test('the Attendance tab lists classes with no attendance recorded', async ({ page }) => {
    await signIn(page)
    await openReportsTab(page, 'Attendance')
    await expect(page.getByRole('heading', { name: /No Attendance Recorded/ })).toBeVisible()
    await expect(page.getByText('Not Recorded', { exact: true }).first()).toBeVisible()
  })

  test('every class can be put back', async ({ page }) => {
    await signIn(page)
    await openReportsTab(page, 'Attendance')
    await pickerButton(page).click()
    await panel(page).getByRole('button', { name: 'All', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Save' }).click()

    await expectToast(page, 'Report classes saved')
    await expect(pickerButton(page)).toHaveText('All classes')
  })
})
