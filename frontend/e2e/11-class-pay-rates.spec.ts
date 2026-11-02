import { expect, test, type Page } from '@playwright/test'
import { expectNoErrorToast, expectToast, goToSection, signIn } from './helpers'

/**
 * Beside each class an instructor teaches, the staff popup's Classes tab
 * sets what they're paid for it — per class, per head, or base + per head —
 * and the rate is still there when the popup is opened again.
 *
 * Uses the instructor the staff file added (first name "E2E"), who teaches at
 * least one class type by now.
 */

async function openInstructorClasses(page: Page) {
  await goToSection(page, 'Staff')
  await page.getByText(/^E2E Instructor/).first().click()
  await page.getByRole('button', { name: 'Classes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible()
}

/** The first ticked class's pay-type dropdown, and its class name. */
async function firstTaughtClass(page: Page) {
  const payType = page.getByLabel(/ pay type$/).first()
  await expect(payType).toBeVisible()
  const label = (await payType.getAttribute('aria-label'))!
  return { payType, name: label.replace(/ pay type$/, '') }
}

test.describe.serial('class pay rates', () => {
  test('a per head rate can be set beside a class', async ({ page }) => {
    await signIn(page)
    await openInstructorClasses(page)

    const { payType, name } = await firstTaughtClass(page)
    await payType.selectOption('per_head')
    await page.getByLabel(`${name} per head`).fill('3.25')
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expectToast(page, /Classes saved/)
    await expectNoErrorToast(page)
  })

  test('the rate is still there when the popup is opened again', async ({ page }) => {
    await signIn(page)
    await openInstructorClasses(page)

    const { payType, name } = await firstTaughtClass(page)
    await expect(payType).toHaveValue('per_head')
    await expect(page.getByLabel(`${name} per head`)).toHaveValue('3.25')
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  test('it can be changed to base + per head', async ({ page }) => {
    await signIn(page)
    await openInstructorClasses(page)

    const { payType, name } = await firstTaughtClass(page)
    await payType.selectOption('blended')
    // The base box starts empty, so Save waits for it.
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    await page.getByLabel(`${name} base`).fill('20')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expectToast(page, /Classes saved/)

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await openInstructorClasses(page)
    await expect((await firstTaughtClass(page)).payType).toHaveValue('blended')
    await expect(page.getByLabel(`${name} base`)).toHaveValue('20.00')
  })
})
