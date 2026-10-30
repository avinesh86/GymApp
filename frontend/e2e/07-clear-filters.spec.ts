import { expect, test, type Page } from '@playwright/test'
import { goToSection, signIn } from './helpers'

/**
 * Timetable, Staff and Reports each have a Clear Filters button that puts the
 * filters back in one click. It only appears while a filter is set.
 */

const clearButton = (page: Page) => page.getByRole('button', { name: 'Clear Filters' })

test.describe('clear filters', () => {
  test('timetable filters clear in one click, and the week stays put', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')
    await expect(clearButton(page)).toBeHidden()

    await page.getByRole('button', { name: 'Next week' }).click()
    const weekLabel = await page.getByText(/ · \d+–\d+ /).textContent()

    await page.getByPlaceholder('Search classes...').fill('spin')
    await page.getByLabel('Filter by class').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Awaiting Attendance' }).click()

    await clearButton(page).click()

    await expect(page.getByPlaceholder('Search classes...')).toHaveValue('')
    await expect(page.getByLabel('Filter by class')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Awaiting Attendance' })).toHaveAttribute('aria-pressed', 'false')
    await expect(clearButton(page)).toBeHidden()
    await expect(page.getByText(weekLabel!)).toBeVisible()
  })

  test('staff filters clear back to active staff, and the sort stays', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Staff')
    await expect(clearButton(page)).toBeHidden()

    await page.getByPlaceholder('Search staff...').fill('zzz')
    await page.getByLabel('Filter by status').selectOption('inactive')
    await page.getByLabel('Sort order').selectOption({ index: 1 })
    const sort = await page.getByLabel('Sort order').inputValue()

    // Nobody matches, and the page says so rather than "add your first staff".
    await expect(page.getByText('No staff match these filters')).toBeVisible()
    await expect(clearButton(page)).toHaveCount(2)
    await clearButton(page).last().click()

    await expect(page.getByPlaceholder('Search staff...')).toHaveValue('')
    await expect(page.getByLabel('Filter by status')).toHaveValue('active')
    await expect(page.getByLabel('Sort order')).toHaveValue(sort)
    await expect(clearButton(page)).toBeHidden()
  })

  test('report filters clear, and the period stays', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Reports')
    await page.getByRole('button', { name: 'Classes', exact: true }).click()

    await page.getByRole('button', { name: 'Last Month' }).click()
    await page.getByLabel('Filter by class type').selectOption({ index: 1 })

    await clearButton(page).click()

    await expect(page.getByLabel('Filter by class type')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Last Month' })).toHaveClass(/bg-cyan-500/)
    await expect(clearButton(page)).toBeHidden()
  })
})
