import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OwnEventCard } from './InstructorCalendarPage'
import { createCoverRequest } from '../../api/cover'
import type { TimetableEvent } from '../../types'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/cover', () => ({ createCoverRequest: vi.fn() }))

function makeEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: 42,
    class_type: 1,
    class_type_name: 'Yoga',
    instructor: 2,
    instructor_name: 'Me',
    site: 1,
    site_name: 'Studio 1',
    date: '2099-06-09',
    start_time: '09:00',
    end_time: '10:00',
    capacity: 20,
    status: 'scheduled',
    attendance_count: null,
    notes: '',
    ...overrides,
  } as TimetableEvent
}

function renderCard(event: TimetableEvent) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OwnEventCard event={event} />
    </QueryClientProvider>,
  )
}

describe('OwnEventCard — instructor Request Cover (F-cover)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createCoverRequest).mockResolvedValue({ id: 1 } as never)
  })

  it('requires confirm before submitting the cover request', async () => {
    renderCard(makeEvent())

    await userEvent.click(screen.getByRole('button', { name: 'Request Cover' }))
    // Not submitted until confirmed.
    expect(createCoverRequest).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /confirm request/i }))
    await waitFor(() => expect(createCoverRequest).toHaveBeenCalledWith({ timetable_event: 42 }))
  })

  it('hides Request Cover for non-scheduled classes', () => {
    renderCard(makeEvent({ status: 'needs_cover' }))
    expect(screen.queryByRole('button', { name: 'Request Cover' })).not.toBeInTheDocument()
  })
})
