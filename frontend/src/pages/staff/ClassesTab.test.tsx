import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ClassesTab, extractApiError } from './StaffDetailModal'
import { listCapabilities, createCapability, deleteCapability, listClassRates, saveClassRates } from '../../api/staff'
import { listClassTypes } from '../../api/timetable'

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../api/staff', () => ({
  listCapabilities: vi.fn(),
  createCapability: vi.fn(),
  deleteCapability: vi.fn(),
  listClassRates: vi.fn().mockResolvedValue([]),
  saveClassRates: vi.fn(),
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

describe('ClassesTab — pay rate beside each class', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCapabilities).mockResolvedValue([{ id: 5, class_type: 10, class_type_name: 'Aqua 45' }] as never)
    vi.mocked(listClassTypes).mockResolvedValue([
      { id: 10, name: 'Aqua 45' },
      { id: 11, name: 'F2 Cardio' },
    ] as never)
    vi.mocked(listClassRates).mockResolvedValue([
      { class_type: 10, class_type_name: 'Aqua 45', rate: { rate_type: 'per_class', amount: '45.00', per_head_rate: '0.00', effective_from: '2026-06-01' } },
    ])
  })

  it('shows the saved rate for a ticked class, and no rate for an unticked one', async () => {
    renderTab()
    expect(await screen.findByLabelText('Aqua 45 pay type')).toHaveValue('per_class')
    expect(await screen.findByLabelText('Aqua 45 rate')).toHaveValue(45)
    expect(screen.queryByLabelText('F2 Cardio pay type')).not.toBeInTheDocument()
  })

  it('saves a base + per head rate from the chosen date', async () => {
    vi.mocked(saveClassRates).mockResolvedValue({ rates: [], drafts_repriced: 2 })
    renderTab()

    await userEvent.selectOptions(await screen.findByLabelText('Aqua 45 pay type'), 'blended')
    const base = screen.getByLabelText('Aqua 45 base')
    await userEvent.clear(base)
    await userEvent.type(base, '20')
    await userEvent.type(screen.getByLabelText('Aqua 45 per head'), '1.5')
    const from = screen.getByLabelText('New rates start from')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-11-02')
    await userEvent.click(screen.getByRole('button', { name: 'Save Rates' }))

    await waitFor(() =>
      expect(saveClassRates).toHaveBeenCalledWith(
        1,
        [{ class_type: 10, rate_type: 'blended', amount: '20', per_head_rate: '1.5' }],
        '2026-11-02',
      ),
    )
    expect(toast.success).toHaveBeenCalledWith('Class rates saved · 2 draft invoices updated')
  })

  it('needs an amount before it will save', async () => {
    renderTab()
    await userEvent.selectOptions(await screen.findByLabelText('Aqua 45 pay type'), 'per_head')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount for every rate')
    expect(screen.getByRole('button', { name: 'Save Rates' })).toBeDisabled()
  })

  it('Save is off until something changes', async () => {
    renderTab()
    await screen.findByLabelText('Aqua 45 rate')
    expect(screen.getByRole('button', { name: 'Save Rates' })).toBeDisabled()
  })
})
