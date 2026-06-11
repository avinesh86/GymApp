import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { getInvoice, submitInvoice, markInvoicePaid } from '../../api/invoices'
import { useAuthStore } from '../../store/auth'
import type { Invoice } from '../../types'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/invoices', () => ({
  getInvoice: vi.fn(),
  submitInvoice: vi.fn(),
  markInvoicePaid: vi.fn(),
  approveInvoice: vi.fn(),
  rejectInvoice: vi.fn(),
  downloadInvoicePdf: vi.fn(),
}))

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1, invoice_number: 'INV-1', instructor: 5, instructor_name: 'Jane',
    period_start: '2026-06-01', period_end: '2026-06-14', status: 'draft',
    total_amount: '50.00', class_count: 1, submitted_at: null, notes: '',
    line_items: [], approvals: [], approval_history: [],
    ...overrides,
  } as Invoice
}

function setRole(role: string) {
  useAuthStore.setState({ user: { id: 9, role } as never })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invoices/1']}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvoiceDetailPage (invoice redesign)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets an instructor submit a draft', async () => {
    setRole('instructor')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'draft' }))
    vi.mocked(submitInvoice).mockResolvedValue(makeInvoice({ status: 'submitted' }))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(submitInvoice).toHaveBeenCalledWith(1))
  })

  it('shows the rejection banner on a rejected invoice', async () => {
    setRole('instructor')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'rejected', rejection_reason: 'Missing data' }))
    renderPage()
    expect(await screen.findByText(/Missing data/)).toBeInTheDocument()
  })

  it('shows the flagged-edits warning to a manager', async () => {
    setRole('gym_manager')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'submitted', has_flagged_items: true }))
    renderPage()
    expect(await screen.findByTestId('flagged-warning')).toBeInTheDocument()
  })

  it('does NOT show Approve to an instructor on a submitted invoice', async () => {
    setRole('instructor')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'submitted' }))
    renderPage()
    await screen.findByText('INV-1')
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
  })

  it('shows Approve to a manager on a submitted invoice', async () => {
    setRole('gym_manager')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'submitted' }))
    renderPage()
    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument()
  })

  it('lets payroll mark a manager-approved invoice paid', async () => {
    setRole('payroll')
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ status: 'manager_approved' }))
    vi.mocked(markInvoicePaid).mockResolvedValue(makeInvoice({ status: 'paid' }))
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /mark paid/i }))
    // Modal opens; confirm.
    const confirmButtons = await screen.findAllByRole('button', { name: /mark paid/i })
    await userEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(markInvoicePaid).toHaveBeenCalledWith(1, expect.objectContaining({ payment_reference: expect.any(String) })))
  })
})
