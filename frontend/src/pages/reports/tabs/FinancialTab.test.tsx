import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FinancialTab } from './FinancialTab'
import { getPayrollReport } from '../../../api/reports'
import { listStaff } from '../../../api/staff'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }
})
vi.mock('../../../api/reports', () => ({ getPayrollReport: vi.fn() }))
vi.mock('../../../api/staff', () => ({ listStaff: vi.fn() }))

const REPORT = {
  total_payroll: '800.0',
  paid_amount: '500.0',
  pending_amount: '300.0',
  avg_per_instructor: '400.0',
  period_breakdown: [],
  instructor_breakdown: [],
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FinancialTab />
    </QueryClientProvider>,
  )
}

describe('FinancialTab — filter by instructor + date (F9)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPayrollReport).mockResolvedValue(REPORT as never)
    vi.mocked(listStaff).mockResolvedValue({
      count: 1, next: null, previous: null,
      results: [{ id: 5, name: 'Frankie', first_name: 'Frankie', last_name: '', email: 'f@t.com', phone: '', role: 'instructor', status: 'active', reliability_score: 100, avatar: null }],
    } as never)
  })

  it('renders an instructor filter from the staff list', async () => {
    renderTab()
    const select = await screen.findByLabelText('Filter by instructor')
    expect(select).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Frankie' })).toBeInTheDocument()
  })

  it('passes the selected instructor to the payroll query', async () => {
    renderTab()
    const select = await screen.findByLabelText('Filter by instructor')
    await screen.findByRole('option', { name: 'Frankie' })

    await userEvent.selectOptions(select, '5')

    await waitFor(() =>
      expect(getPayrollReport).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 5),
    )
  })

  it('exposes a custom date range', async () => {
    renderTab()
    await screen.findByLabelText('Filter by instructor')

    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))

    expect(screen.getByLabelText('From date')).toBeInTheDocument()
    expect(screen.getByLabelText('To date')).toBeInTheDocument()
  })
})
