import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SubscriptionsTab } from './SubscriptionsTab'
import { getFacilitiesConfig, getSubscriptionTotals, listSubscriptions, saveSubscription } from '../../api/facilities'

vi.mock('../../api/facilities', () => ({
  getFacilitiesConfig: vi.fn(),
  listSubscriptions: vi.fn(),
  getSubscriptionTotals: vi.fn(),
  saveSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  attachSubscriptionDocument: vi.fn(),
  removeSubscriptionDocument: vi.fn(),
  listFacilitiesPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'owner' } }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionsTab site="" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFacilitiesConfig).mockResolvedValue({
    equipment_enabled: true,
    maintenance_enabled: true,
    fault_reporting_enabled: true,
    checklists_enabled: true,
    can_do_checklists: true,
    has_checklists: true,
    has_my_checklists: true,
    has_any_checklists: true,
    can_manage_checklists: true,
    licences_enabled: true,
    subscriptions_enabled: true,
    can_manage_records: true,
    can_manage: true,
    is_alert_recipient: true,
    sites: [],
  })
  vi.mocked(listSubscriptions).mockResolvedValue([])
  vi.mocked(getSubscriptionTotals).mockResolvedValue({ count: 2, per_month: '499.00', per_year: '5988.00' })
  vi.mocked(saveSubscription).mockResolvedValue({ id: 1 } as never)
})

describe('Subscriptions', () => {
  it('shows what they cost per month and per year', async () => {
    renderTab()
    const totals = await screen.findByTestId('subscription-totals')
    expect(within(totals).getByText('$499.00')).toBeInTheDocument()
    expect(within(totals).getByText('$5988.00')).toBeInTheDocument()
  })

  it('reminders follow the billing cycle until someone changes them', async () => {
    renderTab()
    await userEvent.click(await screen.findByRole('button', { name: 'Add subscription' }))
    const form = screen.getByRole('dialog')
    expect(within(form).getByText('No reminders')).toBeInTheDocument() // monthly

    await userEvent.selectOptions(within(form).getByLabelText('Billed'), 'yearly')
    expect(within(form).getByText('30 days before')).toBeInTheDocument()
    expect(within(form).getByText('7 days before')).toBeInTheDocument()

    await userEvent.click(within(form).getByRole('button', { name: 'Remove reminder 7 days before' }))
    await userEvent.selectOptions(within(form).getByLabelText('Billed'), 'quarterly')
    expect(within(form).getByText('30 days before')).toBeInTheDocument() // kept: they chose
    expect(within(form).queryByText('14 days before')).not.toBeInTheDocument()

    await userEvent.type(within(form).getByLabelText('Name'), 'Cleaning')
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveSubscription).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: 'Cleaning', billing_cycle: 'quarterly', reminder_days: [30] }),
      ),
    )
  })
})
