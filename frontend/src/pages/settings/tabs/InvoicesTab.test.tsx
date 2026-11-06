import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InvoicesTab } from './InvoicesTab'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'

vi.mock('../../../api/settings', () => ({
  getTenantSettings: vi.fn(),
  updateTenantSettings: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InvoicesTab />
    </QueryClientProvider>,
  )
}

// Deliberately the opposite of the form's old starting values
// (monthly, approval required) so saving those would show up.
const SETTINGS = {
  invoice_frequency: 'fortnightly',
  pay_period_anchor_date: '2026-01-05',
  payroll_approval_required: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue(SETTINGS as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
})

describe('Settings → Invoices', () => {
  it("offers nothing to change or save until the gym's settings have loaded", async () => {
    let finishLoading: (value: unknown) => void = () => {}
    vi.mocked(getTenantSettings).mockReturnValue(new Promise((resolve) => (finishLoading = resolve)) as never)
    renderTab()

    await waitFor(() => expect(getTenantSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save Invoice Settings' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Invoice Frequency')).not.toBeInTheDocument()

    finishLoading(SETTINGS)

    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it("shows the gym's saved settings and saves them unchanged", async () => {
    renderTab()

    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
    expect(screen.getByLabelText('Pay period start date')).toHaveValue('2026-01-05')

    await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        invoice_frequency: 'fortnightly',
        pay_period_anchor_date: '2026-01-05',
        payroll_approval_required: false,
      }),
    )
  })

  it('says so and offers to try again when the settings cannot be loaded', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the invoice settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Invoice Settings' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
  })
})
