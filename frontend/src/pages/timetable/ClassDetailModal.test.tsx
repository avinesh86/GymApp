import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClassDetailModal } from './ClassDetailModal'
import {
  deleteEvent,
  deleteEventSeries,
  updateEvent,
  updateEventSeries,
} from '../../api/timetable'
import { listSites } from '../../api/settings'
import { listStaff } from '../../api/staff'
import type { TimetableEvent } from '../../types'

vi.mock('../../api/timetable', () => ({
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  assignInstructor: vi.fn(),
  cancelEvent: vi.fn(),
  createEvent: vi.fn(),
  createRecurringRule: vi.fn(),
  generateRuleEvents: vi.fn(),
  updateEventSeries: vi.fn(),
  deleteEventSeries: vi.fn(),
}))
vi.mock('../../api/settings', () => ({ listSites: vi.fn() }))
vi.mock('../../api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('../../api/attendance', () => ({ submitAttendanceForEvent: vi.fn() }))
vi.mock('../../api/cover', () => ({ createCoverRequest: vi.fn() }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'owner' } }) }))

function makeEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: 42,
    class_type: 1,
    class_type_name: 'Spin',
    site: 1,
    site_name: 'Main Floor',
    instructor: null,
    instructor_name: null,
    start_datetime: '2030-03-03T20:00:00Z',
    end_datetime: '2030-03-03T21:00:00Z',
    start_time: '09:00',
    end_time: '10:00',
    date: '2030-03-04',
    status: 'unfilled',
    attendance_count: null,
    notes: '',
    internal_notes: '',
    recurring_pattern_id: 'b6f3c1de-0000-4000-8000-000000000001',
    recurring_rule: 5,
    ...overrides,
  } as TimetableEvent
}

function renderModal(event: TimetableEvent) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ClassDetailModal event={event} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

/** The scope dialog is the last dialog opened. */
const scopeDialog = () => {
  const dialogs = screen.getAllByRole('dialog')
  return dialogs[dialogs.length - 1]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listSites).mockResolvedValue([
    { id: 1, name: 'Main Floor' },
    { id: 2, name: 'Studio 2' },
  ] as never)
  vi.mocked(listStaff).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
  vi.mocked(updateEvent).mockResolvedValue(makeEvent())
  vi.mocked(deleteEvent).mockResolvedValue()
  vi.mocked(updateEventSeries).mockResolvedValue({ updated: 4 })
  vi.mocked(deleteEventSeries).mockResolvedValue({ deleted: 4 })
})

async function openEditAndChangeStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  const start = screen.getByLabelText('Start Time')
  await user.clear(start)
  await user.type(start, '06:15')
  await user.click(screen.getByRole('button', { name: /Save Changes/ }))
}

describe('ClassDetailModal — editing a recurring class', () => {
  it('asks whether to change this class or the series', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await openEditAndChangeStart(user)

    const dialog = scopeDialog()
    expect(within(dialog).getByLabelText(/This class only/)).toBeChecked()
    expect(within(dialog).getByLabelText(/This and following classes/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/All classes in the series/)).toBeInTheDocument()
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('saves just this class when "This class only" is chosen', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await openEditAndChangeStart(user)

    await user.click(within(scopeDialog()).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateEvent).mock.calls[0][1]).toMatchObject({
      start_datetime: '2030-03-04T06:15:00',
    })
    expect(updateEventSeries).not.toHaveBeenCalled()
  })

  it('sends only the changed fields to the whole series', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await openEditAndChangeStart(user)

    await user.click(within(scopeDialog()).getByLabelText(/All classes in the series/))
    await user.click(within(scopeDialog()).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateEventSeries).toHaveBeenCalledWith(42, 'all', { start_time: '06:15' }))
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('only offers this class when the date was moved', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2030-03-05')
    await user.click(screen.getByRole('button', { name: /Save Changes/ }))

    expect(within(scopeDialog()).getByLabelText(/This and following classes/)).toBeDisabled()
    expect(within(scopeDialog()).getByLabelText(/All classes in the series/)).toBeDisabled()
  })

  it('does not ask for a one-off class', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent({ recurring_pattern_id: null, recurring_rule: null }))
    await openEditAndChangeStart(user)

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText(/This class only/)).not.toBeInTheDocument()
  })
})

describe('ClassDetailModal — deleting a recurring class', () => {
  it('deletes the following classes when chosen', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await user.click(screen.getByRole('button', { name: 'Manage' }))
    await user.click(screen.getByRole('button', { name: /Delete Permanently/ }))

    await user.click(within(scopeDialog()).getByLabelText(/This and following classes/))
    await user.click(within(scopeDialog()).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteEventSeries).toHaveBeenCalledWith(42, 'following'))
    expect(deleteEvent).not.toHaveBeenCalled()
  })

  it('deletes only this class by default', async () => {
    const user = userEvent.setup()
    renderModal(makeEvent())
    await user.click(screen.getByRole('button', { name: 'Manage' }))
    await user.click(screen.getByRole('button', { name: /Delete Permanently/ }))
    await user.click(within(scopeDialog()).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(42))
    expect(deleteEventSeries).not.toHaveBeenCalled()
  })
})
