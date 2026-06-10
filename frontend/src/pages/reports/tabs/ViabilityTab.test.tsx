import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ViabilityTab } from './ViabilityTab'
import { getClassViabilityReport } from '../../../api/reports'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})
vi.mock('../../../api/reports', () => ({ getClassViabilityReport: vi.fn() }))

const REPORT = {
  by_class_type: [
    { class_type_id: 1, class_type_name: 'Yoga', total_classes: 5, avg_attendance: 12, viability_percentage: 80, red_count: 0, amber_count: 1, green_count: 3, purple_count: 1 },
  ],
  overall_snapshot: { excellent: 1, good: 3, moderate: 1, low: 0, pending: 2 },
  viability_trend: [
    { week_start: '2026-06-01', viability_percentage: 75 },
    { week_start: '2026-06-08', viability_percentage: 90 },
  ],
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ViabilityTab />
    </QueryClientProvider>,
  )
}

describe('ViabilityTab — overall snapshot + trend (F10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getClassViabilityReport).mockResolvedValue(REPORT as never)
  })

  it('renders the overall snapshot with bucket counts', async () => {
    renderTab()
    expect(await screen.findByText('Overall Class Viability Snapshot')).toBeInTheDocument()
    expect(screen.getByText('Excellent')).toBeInTheDocument()
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByTestId('snapshot-bar')).toBeInTheDocument()
  })

  it('renders the viability trend chart', async () => {
    renderTab()
    expect(await screen.findByText('Viability Trend')).toBeInTheDocument()
  })

  it('still renders the per-class viability cards', async () => {
    renderTab()
    expect(await screen.findByText('Yoga')).toBeInTheDocument()
    expect(screen.getByText('80% viable')).toBeInTheDocument()
  })

  it('shows an empty trend message when there is no trend data', async () => {
    vi.mocked(getClassViabilityReport).mockResolvedValue({
      by_class_type: [], overall_snapshot: { excellent: 0, good: 0, moderate: 0, low: 0, pending: 0 }, viability_trend: [],
    } as never)
    renderTab()
    expect(await screen.findByText('No viability trend data')).toBeInTheDocument()
  })
})
