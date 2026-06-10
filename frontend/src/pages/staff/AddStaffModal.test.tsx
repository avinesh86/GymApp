import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddStaffModal } from './AddStaffModal'
import { createStaff, createPayRate, createCapability } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('../../api/staff', () => ({
  createStaff: vi.fn(),
  createPayRate: vi.fn(),
  createCapability: vi.fn(),
}))
vi.mock('../../api/timetable', () => ({ listClassTypes: vi.fn() }))

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AddStaffModal isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('AddStaffModal — Classes Can Teach (F5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createStaff).mockResolvedValue({ id: 1, name: 'Ada Lovelace' } as never)
    vi.mocked(createCapability).mockResolvedValue({ id: 100 } as never)
    vi.mocked(listClassTypes).mockResolvedValue([
      { id: 9, name: 'Yoga' },
      { id: 10, name: 'Spin' },
    ] as never)
  })

  it('renders the class-types grid from class types', async () => {
    renderModal()
    expect(await screen.findByText('Classes Can Teach')).toBeInTheDocument()
    expect(screen.getByLabelText('Yoga')).toBeInTheDocument()
    expect(screen.getByLabelText('Spin')).toBeInTheDocument()
  })

  it('creates capabilities for the selected class types after the staff member', async () => {
    renderModal()
    await screen.findByLabelText('Yoga')

    await userEvent.type(screen.getByLabelText('First Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Last Name'), 'Lovelace')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@t.com')
    await userEvent.click(screen.getByLabelText('Yoga'))

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(createCapability).toHaveBeenCalledWith(1, { class_type: 9 }))
    expect(createCapability).toHaveBeenCalledTimes(1)
  })

  it('does not create capabilities when none are selected', async () => {
    renderModal()
    await screen.findByLabelText('Yoga')

    await userEvent.type(screen.getByLabelText('First Name'), 'Grace')
    await userEvent.type(screen.getByLabelText('Last Name'), 'Hopper')
    await userEvent.type(screen.getByLabelText('Email'), 'grace@t.com')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(1))
    expect(createCapability).not.toHaveBeenCalled()
  })
})
