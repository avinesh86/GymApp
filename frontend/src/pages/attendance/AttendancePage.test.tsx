import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { addHours, format, startOfDay, startOfWeek, subDays, subWeeks } from 'date-fns'
import { AttendancePage } from './AttendancePage'
import {
  listAttendance,
  countAwaitingAttendance,
  submitAttendanceForEvent,
  type AttendanceFilters,
} from '../../api/attendance'
import type { AttendanceRecord } from '../../types'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/attendance', () => ({
  listAttendance: vi.fn(),
  countAwaitingAttendance: vi.fn(),
  submitAttendanceForEvent: vi.fn(),
}))

function awaitingClass(id: number, name: string, start: Date): AttendanceRecord {
  return {
    id,
    event: id,
    count: null,
    recorded_by: null,
    recorded_at: null,
    is_verified: false,
    event_detail: {
      id,
      class_type_name: name,
      date: format(start, 'yyyy-MM-dd'),
      start_time: '09:00',
      end_time: '10:00',
      start_datetime: start.toISOString(),
      site_name: 'Silverdale',
      instructor_name: null,
    },
  } as unknown as AttendanceRecord
}

const today = startOfDay(new Date())
const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 })

// Two classes today, and one on the Sunday before last week — the day that
// used to fall between the Last Week and Older tabs.
let awaiting: AttendanceRecord[]

/** Stands in for the API: filters by the range the page asks for. */
function inRange({ from_datetime, to_datetime }: AttendanceFilters) {
  return awaiting.filter((record) => {
    const start = record.event_detail.start_datetime as string
    return (!from_datetime || start >= from_datetime) && (!to_datetime || start <= to_datetime)
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AttendancePage />
    </QueryClientProvider>,
  )
}

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    awaiting = [
      awaitingClass(1, 'Aqua Fit', today),
      awaitingClass(2, 'Yoga', addHours(today, 1)),
      awaitingClass(3, 'Spin', addHours(subDays(lastWeekStart, 1), 9)),
    ]
    vi.mocked(listAttendance).mockImplementation(async (filters = {}) => inRange(filters))
    vi.mocked(countAwaitingAttendance).mockImplementation(async (filters = {}) => inRange(filters).length)
    vi.mocked(submitAttendanceForEvent).mockImplementation(async (eventId) => {
      awaiting = awaiting.filter((record) => record.event !== eventId)
      return {} as AttendanceRecord
    })
  })

  it('counts each awaiting class once in the header', async () => {
    renderPage()

    // The two from today used to be counted again under This Week, and the
    // Sunday class not at all.
    expect(await screen.findByText('3 classes awaiting attendance')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /^Today/ })).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^This Week/ })).toHaveTextContent(/^This Week$/)
  })

  it('shows a class from the Sunday before last week under Older', async () => {
    renderPage()
    await screen.findByText('Aqua Fit')

    await userEvent.click(screen.getByRole('button', { name: /^Older/ }))

    expect(await screen.findByText('Spin')).toBeInTheDocument()
    expect(screen.queryByText('Aqua Fit')).not.toBeInTheDocument()
  })

  it('will not save until a number has been entered', async () => {
    renderPage()
    await screen.findByText('Aqua Fit')

    // The old Attendance page started every class at 0 with Save enabled, so
    // a stray click recorded an empty class.
    for (const save of screen.getAllByRole('button', { name: 'Save Attendance' })) {
      expect(save).toBeDisabled()
    }
    expect(submitAttendanceForEvent).not.toHaveBeenCalled()
  })

  it('saves the count typed for a class and takes it off the list', async () => {
    renderPage()
    await screen.findByText('Aqua Fit')

    const [aquaFit] = screen.getAllByLabelText('How many attendees?')
    await userEvent.type(aquaFit, '17')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save Attendance' })[0])

    await waitFor(() => expect(submitAttendanceForEvent).toHaveBeenCalledWith(1, 17))
    await waitFor(() => expect(screen.queryByText('Aqua Fit')).not.toBeInTheDocument())
    expect(screen.getByText('Yoga')).toBeInTheDocument()
    expect(await screen.findByText('2 classes awaiting attendance')).toBeInTheDocument()
  })

  it('fills the count from a quick pick', async () => {
    renderPage()
    await screen.findByText('Aqua Fit')

    await userEvent.click(screen.getAllByRole('button', { name: '15' })[1])
    await userEvent.click(screen.getAllByRole('button', { name: 'Save Attendance' })[1])

    await waitFor(() => expect(submitAttendanceForEvent).toHaveBeenCalledWith(2, 15))
  })
})
