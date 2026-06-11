import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CoverOpportunityCard } from './InstructorCalendarPage'
import { acceptCoverForEvent } from '../../api/cover'
import type { TimetableEvent } from '../../types'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/cover', () => ({ acceptCoverForEvent: vi.fn() }))

function makeEvent(): TimetableEvent {
  return {
    id: 20, class_type: 2, class_type_name: 'Spin', instructor: 9, instructor_name: 'John',
    site: 1, site_name: 'Main Studio', date: '2099-06-11', start_time: '19:00', end_time: '19:45',
    capacity: 20, status: 'needs_cover', attendance_count: null, notes: '',
  } as TimetableEvent
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CoverOpportunityCard event={makeEvent()} />
    </QueryClientProvider>,
  )
}

describe('CoverOpportunityCard — direct accept (F-cover)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(acceptCoverForEvent).mockResolvedValue(undefined as never)
  })

  it('accepts the cover for the event after confirm', async () => {
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: 'Accept Cover' }))
    // Requires confirm — nothing accepted yet.
    expect(acceptCoverForEvent).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /confirm accept/i }))
    await waitFor(() => expect(acceptCoverForEvent).toHaveBeenCalledWith(20))
  })
})
