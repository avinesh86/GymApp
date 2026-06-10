import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InstructorsTab } from './InstructorsTab'
import { getInstructorReliabilityReport, getInstructorCharts } from '../../../api/reports'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})
vi.mock('../../../api/reports', () => ({
  getInstructorReliabilityReport: vi.fn(),
  getInstructorCharts: vi.fn(),
}))

const INSTRUCTORS = [
  { instructor_id: 3, instructor_name: 'Dana', total_classes: 10, avg_attendance: 12, reliability_score: 95, cover_requests_count: 1 },
  { instructor_id: 4, instructor_name: 'Eli', total_classes: 6, avg_attendance: 8, reliability_score: 80, cover_requests_count: 2 },
]
const CHARTS = {
  avg_attendance_per_class: [{ class_type_name: 'Yoga', avg_attendance: 12, color: '#06b6d4' }],
  attendance_trend: [{ week_start: '2026-06-01', avg_attendance: 11 }],
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InstructorsTab />
    </QueryClientProvider>,
  )
}

describe('InstructorsTab — filter + per-instructor charts (F8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstructorReliabilityReport).mockResolvedValue(INSTRUCTORS as never)
    vi.mocked(getInstructorCharts).mockResolvedValue(CHARTS as never)
  })

  it('renders an instructor filter listing the instructors', async () => {
    renderTab()
    const select = await screen.findByLabelText('Filter by instructor')
    expect(select).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Dana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Eli' })).toBeInTheDocument()
  })

  it('does not show the per-instructor charts until one is selected', async () => {
    renderTab()
    await screen.findByLabelText('Filter by instructor')
    expect(screen.queryByText('Average Attendance per Class')).not.toBeInTheDocument()
    expect(screen.queryByText('Attendance Trend')).not.toBeInTheDocument()
  })

  it('loads charts for the selected instructor', async () => {
    renderTab()
    const select = await screen.findByLabelText('Filter by instructor')
    await screen.findByRole('option', { name: 'Dana' })

    await userEvent.selectOptions(select, '3')

    await waitFor(() =>
      expect(getInstructorCharts).toHaveBeenCalledWith(expect.any(String), expect.any(String), 3),
    )
    expect(await screen.findByText('Average Attendance per Class')).toBeInTheDocument()
    expect(screen.getByText('Attendance Trend')).toBeInTheDocument()
  })
})
