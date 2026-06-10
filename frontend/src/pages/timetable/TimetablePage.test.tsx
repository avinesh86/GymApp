import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimetablePage } from './TimetablePage'
import { getWeekEvents, listEventsPaginated, listClassTypes } from '../../api/timetable'
import { listStaff } from '../../api/staff'
import { listSites } from '../../api/settings'

vi.mock('../../api/timetable', () => ({
  getWeekEvents: vi.fn(),
  listEventsPaginated: vi.fn(),
  listClassTypes: vi.fn(),
}))
vi.mock('../../api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('../../api/settings', () => ({ listSites: vi.fn() }))
vi.mock('../../components/shared/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../components/shared/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('./ClassDetailModal', () => ({ ClassDetailModal: () => null }))
vi.mock('./AddClassModal', () => ({ AddClassModal: () => null }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimetablePage />
    </QueryClientProvider>,
  )
}

describe('TimetablePage — awaiting attendance filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWeekEvents).mockResolvedValue([])
    vi.mocked(listEventsPaginated).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    vi.mocked(listStaff).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    vi.mocked(listSites).mockResolvedValue([])
    vi.mocked(listClassTypes).mockResolvedValue([])
  })

  it('defaults to not awaiting-only', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /awaiting attendance/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await waitFor(() => expect(getWeekEvents).toHaveBeenCalled())
    expect(getWeekEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ awaiting: undefined }),
    )
  })

  it('toggles awaiting=true and re-queries when clicked', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /awaiting attendance/i })

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(getWeekEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ awaiting: 'true' }),
      ),
    )
  })

  it('toggles back off', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: /awaiting attendance/i })

    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() =>
      expect(getWeekEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ awaiting: undefined }),
      ),
    )
  })
})
