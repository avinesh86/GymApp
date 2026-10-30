import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffPage } from './StaffPage'
import { listStaff } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'

vi.mock('../../api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('../../api/timetable', () => ({ listClassTypes: vi.fn() }))
vi.mock('../../components/shared/RoleGuard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../components/shared/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('./AddStaffModal', () => ({ AddStaffModal: () => null }))
vi.mock('./StaffDetailModal', () => ({ StaffDetailModal: () => null }))

const ALICE = {
  id: 1,
  name: 'Alice',
  first_name: 'Alice',
  last_name: '',
  email: 'alice@t.com',
  phone: '',
  role: 'instructor',
  status: 'active',
  reliability_score: 100,
  avatar: null,
  capabilities: [{ id: 5, staff_id: 1, class_type: 9, class_type_name: 'Yoga' }],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StaffPage />
    </QueryClientProvider>,
  )
}

describe('StaffPage — filters, sort, class tags (F4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listStaff).mockResolvedValue({ count: 1, next: null, previous: null, results: [ALICE] as never })
    vi.mocked(listClassTypes).mockResolvedValue([{ id: 9, name: 'Yoga' }] as never)
  })

  it('renders the new filter controls', async () => {
    renderPage()
    expect(await screen.findByLabelText('Filter by pay rate')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by availability day')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by class type')).toBeInTheDocument()
    expect(screen.getByLabelText('Sort order')).toBeInTheDocument()
  })

  it('passes class_type to the staff query when selected', async () => {
    renderPage()
    const select = await screen.findByLabelText('Filter by class type')
    await screen.findByRole('option', { name: 'Yoga' })

    await userEvent.selectOptions(select, '9')

    await waitFor(() =>
      expect(listStaff).toHaveBeenCalledWith(expect.objectContaining({ class_type: 9 })),
    )
  })

  it('passes ordering=-name for Z-A sort', async () => {
    renderPage()
    const select = await screen.findByLabelText('Sort order')

    await userEvent.selectOptions(select, '-name')

    await waitFor(() =>
      expect(listStaff).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: '-name' })),
    )
  })

  it('hides class tags by default and shows them when toggled', async () => {
    renderPage()
    await screen.findByText('Alice')
    expect(screen.queryByTestId('class-tags')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /show class tags/i }))

    const tags = await screen.findByTestId('class-tags')
    expect(within(tags).getByText('Yoga')).toBeInTheDocument()
  })
})

describe('StaffPage — clear filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listStaff).mockResolvedValue({ count: 1, next: null, previous: null, results: [ALICE] as never })
    vi.mocked(listClassTypes).mockResolvedValue([{ id: 9, name: 'Yoga' }] as never)
  })

  it('is hidden on the default view (Active staff, nothing else set)', async () => {
    renderPage()
    await screen.findByLabelText('Filter by class type')
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })

  it('returns the filters to their defaults but keeps the sort order', async () => {
    renderPage()
    const classSelect = await screen.findByLabelText('Filter by class type')
    await screen.findByRole('option', { name: 'Yoga' })

    await userEvent.selectOptions(classSelect, '9')
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'inactive')
    await userEvent.selectOptions(screen.getByLabelText('Sort order'), '-name')

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(classSelect).toHaveValue('')
    expect(screen.getByLabelText('Filter by status')).toHaveValue('active')
    expect(screen.getByLabelText('Sort order')).toHaveValue('-name')
    await waitFor(() =>
      expect(listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ class_type: undefined, status: 'active', ordering: '-name' }),
      ),
    )
  })
})

describe('StaffPage — nobody matches the filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listStaff).mockImplementation(async (params) =>
      params?.status === 'inactive'
        ? { count: 0, next: null, previous: null, results: [] }
        : ({ count: 1, next: null, previous: null, results: [ALICE] } as never),
    )
    vi.mocked(listClassTypes).mockResolvedValue([{ id: 9, name: 'Yoga' }] as never)
  })

  it('says no staff match, and offers to clear rather than to add staff', async () => {
    renderPage()
    await screen.findByText('Alice')

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'inactive')

    expect(await screen.findByText('No staff match these filters')).toBeInTheDocument()
    expect(screen.queryByText('Add your first staff member to get started')).not.toBeInTheDocument()

    const clearButtons = screen.getAllByRole('button', { name: /clear filters/i })
    await userEvent.click(clearButtons[clearButtons.length - 1])

    expect(await screen.findByText('Alice')).toBeInTheDocument()
  })
})
