import { expect, test, type Page } from '@playwright/test'
import { OWNER, signIn } from './helpers'

/**
 * The top bar on a phone.
 *
 * The menu button used to float over the top bar, covering the start of the
 * page title: on an iPhone 13 "Northern Arena" read "…thern Arena". These
 * check, at real phone widths, that the button and the title sit side by side
 * and the title never runs under the button or pushes the bell off screen.
 */

const menuButton = (page: Page) => page.getByRole('button', { name: 'Open menu' })
const pageTitle = (page: Page) => page.getByRole('banner').getByRole('heading', { level: 1 })

async function expectMenuButtonClearOfTitle(page: Page, width: number) {
  const header = page.getByRole('banner')
  // Found page-wide, not inside the header: it used to float outside it.
  const menu = menuButton(page)
  const title = pageTitle(page)
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
  const bell = header.getByRole('button', { name: 'Open notifications' })
  const bellBox = (await bell.boundingBox())!
  expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(width)
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(bellBox.x)
}

for (const width of [320, 375, 390]) {
  test.describe(`top bar at ${width}px wide`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })

    test('the menu button never covers the page title', async ({ page }) => {
      await signIn(page, OWNER, menuButton(page))
      await expectMenuButtonClearOfTitle(page, width)

      // My Profile has no title of its own, so it shows the default one,
      // which is where the overlap was reported ("…thern Arena").
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
      await menuButton(page).click()
      await page.getByRole('link', { name: 'My Profile' }).click()
      // Not pinned to the text: today it's a hardcoded "Northern Arena" for
      // every gym, which is a separate bug to fix.
      await expect(pageTitle(page)).not.toHaveText('Dashboard')
      await expect(pageTitle(page)).toHaveText(/\S/)
      await expectMenuButtonClearOfTitle(page, width)

      // The button opens the menu, says so, and the menu's close button is
      // a full-size tap target too.
      await menuButton(page).click()
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true')
      const close = page.getByRole('button', { name: 'Close menu' })
      const closeBox = (await close.boundingBox())!
      expect(closeBox.width).toBeGreaterThanOrEqual(44)
      expect(closeBox.height).toBeGreaterThanOrEqual(44)
      await close.click()
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeHidden()
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')

      await menuButton(page).click()
      await page.getByRole('link', { name: 'Dashboard' }).click()
      await expect(pageTitle(page)).toHaveText('Dashboard')
    })
  })
}

test.describe('top bar on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('has no menu button: the sidebar is always there', async ({ page }) => {
    await signIn(page)
    await expect(menuButton(page)).toBeHidden()
  })
})
