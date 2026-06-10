import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClassesTab } from './ClassesTab'
import { getClassesReport, getClassTypes } from '../../../api/reports'

// Render charts without ResizeObserver (jsdom lacks it). The chart card
// headings live outside recharts, so they still assert cleanly.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})
vi.mock('../../../api/reports', () => ({
  getClassesReport: vi.fn(),
  getClassTypes: vi.fn(),
}))

const REPORT = {
  by_class_type: [
    { class_type_id: 9, class_type_name: 'Yoga', total_classes: 8, avg_attendance: 12, viability_percentage: 75, cancellation_percentage: 4, capacity: 20, target: 10, color: '#06b6d4' },
  ],
  attendance_trend: [
    { week_start: '2026-06-01', avg_attendance: 10 },
    { week_start: '2026-06-08', avg_attendance: 14 },
  ],
  by_day_of_week: [
    { day: 'Mon', avg_attendance: 11 },
    { day: 'Tue', avg_attendance: 9 },
  ],
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ClassesTab />
    </QueryClientProvider>,
  )
}

describe('ClassesTab — filter + charts (F7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getClassesReport).mockResolvedValue(REPORT as never)
    vi.mocked(getClassTypes).mockResolvedValue([{ id: 9, name: 'Yoga', color: '#06b6d4' }] as never)
  })

  it('renders the four new chart sections', async () => {
    renderTab()
    expect(await screen.findByText('Attendance Trend')).toBeInTheDocument()
    expect(screen.getByText('Average Attendance by Day of Week')).toBeInTheDocument()
    expect(screen.getByText('Attendance vs Capacity')).toBeInTheDocument()
    expect(screen.getByText('Average Attendance vs Target')).toBeInTheDocument()
  })

  it('renders a class-type filter', async () => {
    renderTab()
    expect(await screen.findByLabelText('Filter by class type')).toBeInTheDocument()
  })

  it('passes the selected class type to the report query', async () => {
    renderTab()
    const select = await screen.findByLabelText('Filter by class type')
    await screen.findByRole('option', { name: 'Yoga' })

    await userEvent.selectOptions(select, '9')

    await waitFor(() =>
      expect(getClassesReport).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 9),
    )
  })

  it('shows the empty state when there is no class data', async () => {
    vi.mocked(getClassesReport).mockResolvedValue({ by_class_type: [], attendance_trend: [], by_day_of_week: [] } as never)
    renderTab()
    expect(await screen.findByText('No class data available')).toBeInTheDocument()
  })
})
