import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportReportModal } from './ExportReportModal'
import {
  createReportSchedule,
  exportReport,
  listReportSchedules,
  sendReportScheduleNow,
  updateReportSchedule,
} from '../../api/reports'

vi.mock('../../api/reports', () => ({
  exportReport: vi.fn(),
  listReportSchedules: vi.fn(),
  createReportSchedule: vi.fn(),
  updateReportSchedule: vi.fn(),
  deleteReportSchedule: vi.fn(),
  sendReportScheduleNow: vi.fn(),
}))

const SCHEDULE = {
  id: 7,
  name: 'Owners weekly',
  frequency: 'weekly' as const,
  send_time: '07:00',
  sections: ['summary' as const, 'financial' as const],
  recipients: ['owner@gym.com'],
  is_active: true,
  last_period_start: null,
  last_sent_at: null,
  created_by_name: 'Justin',
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ExportReportModal isOpen onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('ExportReportModal — download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportReport).mockResolvedValue(new Blob(['%PDF']))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  })

  it('downloads the chosen period with only the ticked sections', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }))
    const day = screen.getByLabelText('Day')
    await userEvent.clear(day)
    await userEvent.type(day, '2026-11-03')
    await userEvent.click(screen.getByRole('checkbox', { name: /Financial/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Instructors/ }))
    expect(screen.getByText('Report covers Tue 3 Nov 2026')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }))

    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith({
        frequency: 'daily',
        date: '2026-11-03',
        sections: ['summary', 'attendance', 'classes', 'viability'],
      }),
    )
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('sends the first of the month for a monthly report', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }))
    const month = screen.getByLabelText('Month')
    await userEvent.clear(month)
    await userEvent.type(month, '2026-10')
    expect(screen.getByText('Report covers October 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }))

    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'monthly', date: '2026-10-01' })),
    )
  })

  it('can’t download with no sections ticked', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled()
  })
})

describe('ExportReportModal — email schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listReportSchedules).mockResolvedValue([])
    vi.mocked(createReportSchedule).mockResolvedValue(SCHEDULE)
    vi.mocked(sendReportScheduleNow).mockResolvedValue({ detail: 'Sent to 1 recipient(s).' })
    vi.mocked(updateReportSchedule).mockResolvedValue({ ...SCHEDULE, is_active: false })
  })

  it('creates a schedule with the chosen sections and recipients', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('tab', { name: 'Email schedules' }))
    expect(await screen.findByText('No scheduled reports yet.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New Schedule' }))
    const form = screen.getByRole('form', { name: 'New schedule' })
    await userEvent.type(within(form).getByLabelText('Schedule name'), 'Owners monthly')
    await userEvent.click(within(form).getByRole('radio', { name: 'Monthly' }))
    expect(within(form).getByText('Emailed at 7:00am gym time on the 1st of each month, for the month before.')).toBeInTheDocument()
    const sendAt = within(form).getByLabelText('Send at')
    await userEvent.clear(sendAt)
    await userEvent.type(sendAt, '18:30')
    expect(within(form).getByText(/Emailed at 6:30pm gym time/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Clear all' }))
    await userEvent.click(within(form).getByRole('checkbox', { name: /Financial/ }))
    await userEvent.click(within(form).getByRole('checkbox', { name: /Summary/ }))
    await userEvent.type(within(form).getByLabelText('Email to'), 'owner@gym.com, ops@gym.com')

    await userEvent.click(within(form).getByRole('button', { name: 'Create Schedule' }))

    await waitFor(() =>
      expect(createReportSchedule).toHaveBeenCalledWith({
        name: 'Owners monthly',
        frequency: 'monthly',
        send_time: '18:30',
        sections: ['summary', 'financial'],
        recipients: ['owner@gym.com', 'ops@gym.com'],
      }),
    )
  })

  it('needs a name, a section and a recipient before saving', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('tab', { name: 'Email schedules' }))
    await userEvent.click(await screen.findByRole('button', { name: 'New Schedule' }))
    const form = screen.getByRole('form', { name: 'New schedule' })

    await userEvent.type(within(form).getByLabelText('Schedule name'), 'Daily')

    expect(within(form).getByRole('button', { name: 'Create Schedule' })).toBeDisabled()
  })

  it('lists schedules and can send one now or pause it', async () => {
    vi.mocked(listReportSchedules).mockResolvedValue([SCHEDULE])
    renderModal()
    await userEvent.click(screen.getByRole('tab', { name: 'Email schedules' }))

    const row = await screen.findByTestId('report-schedule')
    expect(within(row).getByText('Owners weekly')).toBeInTheDocument()
    expect(within(row).getByText('Weekly at 7:00am · Summary, Financial')).toBeInTheDocument()
    expect(within(row).getByText('To owner@gym.com')).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: 'Send Owners weekly now' }))
    await waitFor(() => expect(sendReportScheduleNow).toHaveBeenCalledWith(7))

    await userEvent.click(within(row).getByRole('button', { name: 'Pause Owners weekly' }))
    await waitFor(() => expect(updateReportSchedule).toHaveBeenCalledWith(7, { is_active: false }))
  })
})
