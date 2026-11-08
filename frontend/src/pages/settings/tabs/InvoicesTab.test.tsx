import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
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

  it("shows the gym's saved settings and saves only what was changed", async () => {
    renderTab()

    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
    expect(screen.getByLabelText('Pay period start date')).toHaveValue('2026-01-05')

    await userEvent.selectOptions(screen.getByLabelText('Invoice Frequency'), 'weekly')
    await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        invoice_frequency: 'weekly',
        expected: { invoice_frequency: 'fortnightly' },
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

  it('shows the saved values on coming back to the tab while a save was still going', async () => {
    // Coming back before the save finished used to show the cached copy from
    // before it, and the next Save would put the old values back.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    function SwitchTabs() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>Switch tab</button>
          {open && <InvoicesTab />}
        </>
      )
    }
    render(
      <QueryClientProvider client={client}>
        <SwitchTabs />
      </QueryClientProvider>,
    )
    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')

    let finishSave: (value: unknown) => void = () => {}
    vi.mocked(updateTenantSettings).mockReturnValue(new Promise((resolve) => (finishSave = resolve)) as never)
    await userEvent.selectOptions(screen.getByLabelText('Invoice Frequency'), 'weekly')
    await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

    await userEvent.click(screen.getByRole('button', { name: 'Switch tab' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch tab' }))
    expect(screen.queryByLabelText('Invoice Frequency')).not.toBeInTheDocument()

    vi.mocked(getTenantSettings).mockResolvedValue({ ...SETTINGS, invoice_frequency: 'weekly' } as never)
    finishSave({})

    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('weekly')
  })

  describe('when someone else changed the settings since the form opened', () => {
    const THEIRS = { ...SETTINGS, invoice_frequency: 'weekly' }

    it("warns instead of saving over their change, and names what changed", async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      vi.mocked(getTenantSettings).mockResolvedValue(THEIRS as never)

      await userEvent.click(screen.getByLabelText('Pay period start date'))
      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      const warning = await screen.findByRole('alert')
      expect(warning).toHaveTextContent('Someone else changed these settings')
      expect(warning).toHaveTextContent('Invoice Frequency (now: Weekly)')
      expect(updateTenantSettings).not.toHaveBeenCalled()
    })

    it('"Use their values" shows their values in the form', async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      vi.mocked(getTenantSettings).mockResolvedValue(THEIRS as never)
      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      await userEvent.click(await screen.findByRole('button', { name: 'Use their values' }))

      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('weekly')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(updateTenantSettings).not.toHaveBeenCalled()
    })

    it('"Save my changes" saves only what this person changed, and keeps their other changes', async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      fireEvent.change(screen.getByLabelText('Pay period start date'), { target: { value: '2026-02-02' } })
      vi.mocked(getTenantSettings).mockResolvedValue(THEIRS as never)
      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      await userEvent.click(await screen.findByRole('button', { name: 'Save my changes' }))

      await waitFor(() =>
        expect(updateTenantSettings).toHaveBeenCalledWith({
          pay_period_anchor_date: '2026-02-02',
          expected: { pay_period_anchor_date: '2026-01-05' },
        }),
      )
      // Their frequency is kept, and now shown.
      expect(screen.getByLabelText('Invoice Frequency')).toHaveValue('weekly')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('"Save my changes" saves mine against their value when we both changed the same field', async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      await userEvent.selectOptions(screen.getByLabelText('Invoice Frequency'), 'monthly')
      vi.mocked(getTenantSettings).mockResolvedValue(THEIRS as never)
      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      await userEvent.click(await screen.findByRole('button', { name: 'Save my changes' }))

      await waitFor(() =>
        expect(updateTenantSettings).toHaveBeenCalledWith({
          invoice_frequency: 'monthly',
          expected: { invoice_frequency: 'weekly' },
        }),
      )
    })

    it('"Use their values" keeps what this person entered in other fields', async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      fireEvent.change(screen.getByLabelText('Pay period start date'), { target: { value: '2026-02-02' } })
      vi.mocked(getTenantSettings).mockResolvedValue(THEIRS as never)
      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      await userEvent.click(await screen.findByRole('button', { name: 'Use their values' }))

      expect(screen.getByLabelText('Invoice Frequency')).toHaveValue('weekly')
      expect(screen.getByLabelText('Pay period start date')).toHaveValue('2026-02-02')
    })

    it('shows the warning when the server refuses because of a change in the moment before saving', async () => {
      renderTab()
      expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')
      await userEvent.selectOptions(screen.getByLabelText('Invoice Frequency'), 'monthly')
      const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
      vi.mocked(updateTenantSettings).mockRejectedValueOnce(
        new AxiosError('Conflict', '409', config, null, {
          status: 409, statusText: 'Conflict', headers: {}, config,
          data: { changed: ['invoice_frequency'], current: THEIRS },
        }),
      )

      await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Invoice Frequency (now: Weekly)')
    })
  })

  it("doesn't warn about its own earlier save", async () => {
    renderTab()
    expect(await screen.findByLabelText('Invoice Frequency')).toHaveValue('fortnightly')

    await userEvent.selectOptions(screen.getByLabelText('Invoice Frequency'), 'monthly')
    await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))
    await waitFor(() => expect(updateTenantSettings).toHaveBeenCalledTimes(1))
    // The server now holds what this form saved.
    vi.mocked(getTenantSettings).mockResolvedValue({ ...SETTINGS, invoice_frequency: 'monthly' } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save Invoice Settings' }))
    await waitFor(() => expect(updateTenantSettings).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
