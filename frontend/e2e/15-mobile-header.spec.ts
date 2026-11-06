import { expect, test, type Page } from '@playwright/test'
import { OWNER } from './helpers'

/**
 * The top bar on a phone.
 *
 * The menu button used to float over the top bar, covering the start of the
 * page title: on an iPhone 13 "Northern Arena" read "…thern Arena". These
 * check, at real phone widths, that the button and the title sit side by side
 * and the title never runs under the button or pushes the bell off screen.
 */

/** Signs in from the front door. The sidebar menu is hidden on a phone, so
 *  the shared signIn helper (which waits for it) doesn't apply here. */
async function signInOnPhone(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email address').fill(OWNER.email)
  await page.getByLabel('Password').fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('button', { name: 'Open menu' }),
    'signing in on a phone should show the menu button',
  ).toBeVisible()
}

async function expectMenuButtonClearOfTitle(page: Page, width: number) {
  const header = page.getByRole('banner')
  // Found page-wide, not inside the header: it used to float outside it.
  const menu = page.getByRole('button', { name: 'Open menu' })
  const title = header.getByRole('heading', { level: 1 })
  await expect(title).toBeVisible()

  const menuBox = (await menu.boundingBox())!
  const titleBox = (await title.boundingBox())!
  const headerBox = (await header.boundingBox())!

  // Side by side, not on top of each other.
  expect(
    titleBox.x,
    `the title starts at ${titleBox.x}px but the menu button runs to ${menuBox.x + menuBox.width}px`,
  ).toBeGreaterThanOrEqual(menuBox.x + menuBox.width)

  // A comfortable tap target.
  expect(menuBox.width).toBeGreaterThanOrEqual(44)
  expect(menuBox.height).toBeGreaterThanOrEqual(44)

  // The button lives inside the top bar rather than hanging off it.
  expect(menuBox.y).toBeGreaterThanOrEqual(headerBox.y)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height)

  // Nothing in the top bar, including the bell, spills past the screen edge.
  const bell = header.getByRole('button', { name: 'Notifications' })
  const bellBox = (await bell.boundingBox())!
  expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(width)
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(bellBox.x)
}

for (const width of [320, 375, 390]) {
  test.describe(`top bar at ${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })

    test('the menu button never covers the page title', async ({ page }) => {
      await signInOnPhone(page)
      await expectMenuButtonClearOfTitle(page, width)

      // Pages without a title of their own show the gym's name, which is
      // where the overlap was reported ("…thern Arena").
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.getByRole('link', { name: 'My Profile' }).click()
      await expect(page.getByRole('banner').getByRole('heading', { level: 1 })).toHaveText(
        'Northern Arena',
      )
      await expectMenuButtonClearOfTitle(page, width)

      // And the button still opens the menu.
      await page.getByRole('button', { name: 'Open menu' }).click()
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
      await page.getByRole('link', { name: 'Dashboard' }).click()
      await expect(page.getByRole('banner').getByRole('heading', { level: 1 })).toHaveText(
        'Dashboard',
      )
    })
  })
}

test.describe('top bar on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('has no menu button: the sidebar is always there', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email address').fill(OWNER.email)
    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
  })
})
