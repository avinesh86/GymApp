import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddStaffModal } from './AddStaffModal'
import { EditStaffModal } from './EditStaffModal'
import { updateStaff } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import type { StaffMember } from '../../types'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('../../api/staff', () => ({
  createStaff: vi.fn(),
  createPayRate: vi.fn(),
  createCapability: vi.fn(),
  updateStaff: vi.fn(),
}))
vi.mock('../../api/timetable', () => ({ listClassTypes: vi.fn() }))

const auth = vi.hoisted(() => ({ role: 'owner' }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function roleOptions() {
  return Array.from((screen.getByLabelText(/Role/) as HTMLSelectElement).options).map((o) => o.text)
}

describe('AddStaffModal — roles on offer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listClassTypes).mockResolvedValue([])
  })

  it('lets a gym manager add staff, without offering Admin', () => {
    auth.role = 'gym_manager'
    wrap(<AddStaffModal isOpen onClose={vi.fn()} />)

    expect(roleOptions()).toContain('Instructor')
    expect(roleOptions()).toContain('Gym Manager')
    expect(roleOptions()).not.toContain('Admin')
  })

  it('offers Admin to an admin', () => {
    auth.role = 'admin'
    wrap(<AddStaffModal isOpen onClose={vi.fn()} />)

    expect(roleOptions()).toContain('Admin')
  })
})

describe('EditStaffModal', () => {
  it('saves a changed name under the field the API stores', async () => {
    vi.mocked(updateStaff).mockResolvedValue({} as never)
    const staff = {
      id: 5, name: 'Mia Chen', first_name: 'Mia', last_name: 'Chen',
      email: 'mia@example.com', phone: '', role: 'instructor', status: 'active',
      reliability_score: 100, avatar: null,
    } as StaffMember

    wrap(<EditStaffModal staff={staff} onClose={vi.fn()} />)
    const lastName = screen.getByLabelText(/Last Name/)
    await userEvent.clear(lastName)
    await userEvent.type(lastName, 'Walker')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateStaff).toHaveBeenCalled())
    const payload = vi.mocked(updateStaff).mock.calls[0][1]
    // first_name / last_name are read-only on the API: sent alone, the rename
    // was accepted with a success message and then discarded.
    expect(payload).toMatchObject({ name: 'Mia Walker' })
    expect(payload).not.toHaveProperty('last_name')
  })
})
