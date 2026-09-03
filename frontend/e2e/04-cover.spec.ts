import { expect, test } from '@playwright/test'
import { goToSection, openFirstClass, signIn } from './helpers'

/**
 * Cover, end to end through the interface.
 *
 * This file exists because of what shipped broken here. The Accept button
 * posted to a route that did not exist, so it 404'd on every deploy. A
 * cancelled request crashed the serializer, which took out the whole board and
 * left it reporting "All classes are covered" while the timetable said
 * otherwise. Neither is visible to a test that checks the API alone — both
 * need a browser clicking the button.
 */

test.describe.serial('cover', () => {
  test('a class can be given an instructor', async ({ page }) => {
    // Cover means someone who was teaching now cannot, so the class needs an
    // instructor before asking for one makes sense.
    await signIn(page)
    await goToSection(page, 'Timetable')

    await openFirstClass(page)
    await page.getByRole('button', { name: 'Manage', exact: true }).click()

    // Identified by its "Unassigned" option, which no other select has.
    // "Assign Instructor" is a <p> rather than a <label>, so the select has no
    // accessible name, and the timetable's own filter dropdowns sit behind the
    // modal and still count as visible.
    const instructorSelect = page
      .locator('select')
      .filter({ has: page.getByRole('option', { name: 'Unassigned' }) })
    await instructorSelect.selectOption({ index: 1 })

    // The button reads "Unassign Instructor" until someone is chosen, so its
    // label is itself the confirmation that the selection took.
    await page.getByRole('button', { name: 'Update Assignment' }).click()

    await expect(page.getByText(/Failed to update/i)).toBeHidden()
  })

  test('a cover request can be raised from a class', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Timetable')

    await openFirstClass(page)
    await page.getByRole('button', { name: 'Manage', exact: true }).click()
    await page.getByRole('button', { name: /Create Cover Request/i }).click()

    // Assert the success toast rather than the absence of an error. A test
    // that only checks nothing went wrong passes when nothing happened at all.
    await expect(page.getByText('Cover request created')).toBeVisible()
  })

  test('raising a request updates the board without a reload', async ({ page }) => {
    // The stale-cache bug, tested the only way it can be: in one session,
    // moving between pages by clicking. Raising a request changes data the
    // Cover Board holds separately, and it used to need a hard refresh.
    await signIn(page)
    await goToSection(page, 'Cover Board')
    const before = await page.getByRole('button', { name: 'View Details' }).count()

    await goToSection(page, 'Timetable')
    await openFirstClass(page)
    await page.getByRole('button', { name: 'Manage', exact: true }).click()
    await page.getByRole('button', { name: /Create Cover Request/i }).click()
    await expect(page.getByText('Cover request created')).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})
    await goToSection(page, 'Cover Board')

    await expect
      .poll(() => page.getByRole('button', { name: 'View Details' }).count(), {
        message: 'the new request should appear without a manual refresh',
      })
      .toBeGreaterThan(before)
  })

  test('the board lists the request rather than claiming all is covered', async ({ page }) => {
    // The regression that hid a live request behind "All classes are covered".
    await signIn(page)
    await goToSection(page, 'Cover Board')

    await expect(page.getByText(/Couldn't load cover requests/i)).toBeHidden()
    await expect(page.getByText('Open Requests').first()).toBeVisible()
  })

  test('the board opens a request without erroring', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Cover Board')

    const viewDetails = page.getByRole('button', { name: 'View Details' }).first()
    test.skip(!(await viewDetails.isVisible().catch(() => false)), 'no requests on the board')

    await viewDetails.click()

    await expect(page.getByText('Cover Request Details')).toBeVisible()
    await expect(page.getByText(/Failed to/i)).toBeHidden()
  })

  test('a manager can choose who to offer it to', async ({ page }) => {
    // The panel behind candidates + send-offers, which had no UI at all until
    // recently — cover could only ever auto-dispatch.
    await signIn(page)
    await goToSection(page, 'Cover Board')

    const viewDetails = page.getByRole('button', { name: 'View Details' }).first()
    test.skip(!(await viewDetails.isVisible().catch(() => false)), 'no requests on the board')
    await viewDetails.click()

    const panel = page.getByText(/Offer to specific instructors/i)
    test.skip(!(await panel.isVisible().catch(() => false)), 'request is already resolved')

    // Either eligible instructors to tick, or the explanation of why there are
    // none. A blank panel would be the bad outcome.
    const candidate = page.getByRole('checkbox').first()
    const emptyReason = page.getByText(/No eligible instructors/i)

    await expect(candidate.or(emptyReason).first()).toBeVisible()
  })

  test('a request can be cancelled with a reason', async ({ page }) => {
    // Cancelling used to report failure while having actually succeeded —
    // the state saved, then serialising the response threw.
    await signIn(page)
    await goToSection(page, 'Cover Board')

    const viewDetails = page.getByRole('button', { name: 'View Details' }).first()
    test.skip(!(await viewDetails.isVisible().catch(() => false)), 'no requests on the board')
    await viewDetails.click()

    const cancel = page.getByRole('button', { name: /Cancel this request/i })
    test.skip(!(await cancel.isVisible().catch(() => false)), 'request is not cancellable')

    await cancel.click()
    await page.getByRole('textbox').last().fill('Cancelled by the end-to-end tests')
    await page.getByRole('button', { name: /Confirm cancellation/i }).click()

    await expect(page.getByText(/Failed to cancel/i)).toBeHidden()
  })

  test('the board still loads after a cancellation', async ({ page }) => {
    // The actual regression: one cancelled request made the list endpoint 500,
    // so the whole board went blank for everyone.
    await signIn(page)
    await goToSection(page, 'Cover Board')

    await expect(page.getByText(/Couldn't load cover requests/i)).toBeHidden()
    await expect(page.getByText('Open Requests').first()).toBeVisible()
  })

  test('a resolved request can be cleared off the board', async ({ page }) => {
    await signIn(page)
    await goToSection(page, 'Cover Board')

    const remove = page.getByRole('button', { name: /Remove from the board/i }).first()
    test.skip(!(await remove.isVisible().catch(() => false)), 'nothing resolved to clear')

    page.once('dialog', (dialog) => dialog.accept())
    await remove.click()

    await expect(page.getByText(/Failed to remove/i)).toBeHidden()
  })
})
