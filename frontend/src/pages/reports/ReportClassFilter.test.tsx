import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReportClassFilter } from './ReportClassFilter'
import { UnrecordedSection } from './UnrecordedSection'
import { getClassTypes, getReportClassFilter, getUnrecordedReport, saveReportClassFilter } from '../../api/reports'

vi.mock('../../api/reports', () => ({
  getClassTypes: vi.fn(),
  getReportClassFilter: vi.fn(),
  saveReportClassFilter: vi.fn(),
  getUnrecordedReport: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const CLASS_TYPES = [
  { id: 1, name: 'Spin', color: '#0d9488' },
  { id: 2, name: 'Virtual RPM', color: '#7c3aed' },
  { id: 3, name: 'Family Swim', color: '#2563eb' },
]

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClassTypes).mockResolvedValue(CLASS_TYPES)
  vi.mocked(getReportClassFilter).mockResolvedValue({ excluded_class_types: [2] })
  vi.mocked(saveReportClassFilter).mockImplementation(async (ids) => ({ excluded_class_types: ids }))
})

describe('ReportClassFilter', () => {
  it("shows the gym's saved selection on the button", async () => {
    renderWithClient(<ReportClassFilter />)
    expect(await screen.findByRole('button', { name: /2 of 3 classes/ })).toBeInTheDocument()
  })

  it('ticks the included classes and saves unticked ones as excluded', async () => {
    renderWithClient(<ReportClassFilter />)
    await userEvent.click(await screen.findByRole('button', { name: /2 of 3 classes/ }))

    const panel = screen.getByRole('dialog', { name: 'Classes in reports' })
    expect(within(panel).getByRole('checkbox', { name: /Spin/ })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: /Virtual RPM/ })).not.toBeChecked()

    await userEvent.click(within(panel).getByRole('checkbox', { name: /Family Swim/ }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveReportClassFilter).toHaveBeenCalledWith([2, 3]))
    expect(await screen.findByRole('button', { name: /1 of 3 classes/ })).toBeInTheDocument()
  })

  it('Cancel leaves the saved selection alone', async () => {
    renderWithClient(<ReportClassFilter />)
    await userEvent.click(await screen.findByRole('button', { name: /2 of 3 classes/ }))
    const panel = screen.getByRole('dialog', { name: 'Classes in reports' })
    await userEvent.click(within(panel).getByRole('button', { name: 'All' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))

    expect(saveReportClassFilter).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /2 of 3 classes/ })).toBeInTheDocument()
  })
})

describe('UnrecordedSection', () => {
  it('lists slots with how often they went unrecorded, out of how often they ran', async () => {
    vi.mocked(getUnrecordedReport).mockResolvedValue({
      total: 3,
      by_slot: [
        {
          class_type_id: 1, class_name: 'Spin', day: 'Mon', time: '08:30', missed: 2, held: 3,
          last_missed: '26 Oct 2026', instructors: [{ name: 'Jane Smith', missed: 2 }],
        },
      ],
      classes: [],
    })
    renderWithClient(<UnrecordedSection from="2026-10-01" to="2026-10-31" />)

    const table = await screen.findByRole('table', { name: 'Classes with no attendance recorded' })
    expect(within(table).getByText('Spin')).toBeInTheDocument()
    expect(within(table).getByText('Mon 08:30')).toBeInTheDocument()
    expect(within(table).getByText('2 of 3')).toBeInTheDocument()
    expect(within(table).getByText('Jane Smith (2)')).toBeInTheDocument()
  })
})
