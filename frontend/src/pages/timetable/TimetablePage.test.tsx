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
// Guards depend on auth context we don't need for this test.
vi.mock('../../components/shared/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../components/shared/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
// Closed modals — keep them inert.
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWeekEvents).mockResolvedValue([])
  vi.mocked(listEventsPaginated).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
  vi.mocked(listStaff).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
  vi.mocked(listSites).mockResolvedValue([])
  vi.mocked(listClassTypes).mockResolvedValue([
    { id: 7, name: 'Yoga' },
    { id: 8, name: 'Spin' },
  ] as never)
})

describe('TimetablePage — filter by class (F2)', () => {
  it('renders a class filter populated from class types', async () => {
    renderPage()
    const select = await screen.findByLabelText('Filter by class')
    expect(select).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Yoga' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Spin' })).toBeInTheDocument()
  })

  it('passes the selected class_type to the week query', async () => {
    renderPage()
    const select = await screen.findByLabelText('Filter by class')
    await screen.findByRole('option', { name: 'Spin' })

    await userEvent.selectOptions(select, '8')

    await waitFor(() =>
      expect(getWeekEvents).toHaveBeenCalledWith(expect.objectContaining({ class_type: 8 })),
    )
  })

  it('omits class_type when "All Classes" is selected', async () => {
    renderPage()
    await screen.findByLabelText('Filter by class')

    await waitFor(() => expect(getWeekEvents).toHaveBeenCalled())
    expect(getWeekEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ class_type: undefined }),
    )
  })
})

describe('TimetablePage — awaiting attendance filter (F3)', () => {
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
