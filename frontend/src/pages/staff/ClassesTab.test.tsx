import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClassesTab, extractApiError } from './StaffDetailModal'
import { listCapabilities, createCapability, deleteCapability } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../api/staff', () => ({
  listCapabilities: vi.fn(),
  createCapability: vi.fn(),
  deleteCapability: vi.fn(),
}))
vi.mock('../../api/timetable', () => ({
  listClassTypes: vi.fn(),
}))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ClassesTab staffId={1} />
    </QueryClientProvider>,
  )
}

describe('extractApiError', () => {
  it('reads DRF field errors', () => {
    const err = { response: { data: { class_type: ['This class type is required.'] } } }
    expect(extractApiError(err, 'fallback')).toBe('This class type is required.')
  })
  it('reads a detail message', () => {
    expect(extractApiError({ response: { data: { detail: 'Nope.' } } }, 'fb')).toBe('Nope.')
  })
  it('falls back when shape is unknown', () => {
    expect(extractApiError(new Error('x'), 'fallback')).toBe('fallback')
  })
})

describe('ClassesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCapabilities).mockResolvedValue([])
    vi.mocked(listClassTypes).mockResolvedValue([
      { id: 10, name: 'Aqua 45' },
      { id: 11, name: 'F2 Cardio' },
    ] as never)
  })

  it('adds a class type when toggled on', async () => {
    vi.mocked(createCapability).mockResolvedValue({ id: 99, class_type: 10 } as never)

    renderTab()
    const checkbox = await screen.findByLabelText('Aqua 45')
    await userEvent.click(checkbox)

    await waitFor(() => expect(createCapability).toHaveBeenCalledWith(1, { class_type: 10 }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Class type added'))
  })

  it('surfaces the real backend error, not a generic "Failed" message', async () => {
    vi.mocked(createCapability).mockRejectedValue({
      response: { data: { class_type: ['Instructor is not qualified for this class.'] } },
    })

    renderTab()
    const checkbox = await screen.findByLabelText('F2 Cardio')
    await userEvent.click(checkbox)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Instructor is not qualified for this class.'),
    )
    expect(toast.error).not.toHaveBeenCalledWith('Failed to add class type')
  })
})
