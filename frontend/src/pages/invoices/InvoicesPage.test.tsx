import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { InvoicesPage } from './InvoicesPage'
import { listInvoices, generateInvoice } from '../../api/invoices'
import { useAuthStore } from '../../store/auth'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/invoices', () => ({
  listInvoices: vi.fn(),
  generateInvoice: vi.fn(),
}))
// usePermission may read other state; stub to a permissive can().
vi.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ can: () => false }) }))

function setRole(role: string) {
  useAuthStore.setState({ user: { id: 9, role } as never })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InvoicesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvoicesPage — instructor generate (invoice redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listInvoices).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    vi.mocked(generateInvoice).mockResolvedValue({ id: 7 } as never)
  })

  it('shows a Generate Invoice action for instructors and generates for a period', async () => {
    setRole('instructor')
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /generate invoice/i }))
    expect(await screen.findByLabelText('Period start')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }))

    await waitFor(() =>
      expect(generateInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ period_start: expect.any(String), period_end: expect.any(String) }),
      ),
    )
  })

  it('does not show Generate for managers', async () => {
    setRole('gym_manager')
    renderPage()
    await screen.findByText('All Invoices')
    expect(screen.queryByRole('button', { name: /generate invoice/i })).not.toBeInTheDocument()
  })
})
