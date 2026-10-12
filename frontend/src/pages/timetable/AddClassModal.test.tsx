import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddClassModal } from './AddClassModal'
import { createEvent, createRecurringRule, generateRuleEvents, listClassTypes } from '../../api/timetable'
import { listStaff } from '../../api/staff'
import { listSites } from '../../api/settings'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('../../api/timetable', () => ({
  createEvent: vi.fn(),
  createRecurringRule: vi.fn(),
  generateRuleEvents: vi.fn(),
  listClassTypes: vi.fn(),
}))
vi.mock('../../api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('../../api/settings', () => ({ listSites: vi.fn() }))

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AddClassModal isOpen onClose={vi.fn()} defaultDate="2030-03-04" />
    </QueryClientProvider>,
  )
}

async function fillBasics() {
  await screen.findByRole('option', { name: 'Spin' })
  await screen.findByRole('option', { name: 'Main Floor' })
  await userEvent.selectOptions(screen.getByLabelText(/Class Type/), '1')
  await userEvent.selectOptions(screen.getByLabelText(/Location/), '2')
  const capacity = screen.getByLabelText(/Capacity/)
  await userEvent.clear(capacity)
  await userEvent.type(capacity, '35')
}

describe('AddClassModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listClassTypes).mockResolvedValue([{ id: 1, name: 'Spin' }] as never)
    vi.mocked(listSites).mockResolvedValue([{ id: 2, name: 'Main Floor' }] as never)
    vi.mocked(listStaff).mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    vi.mocked(createEvent).mockResolvedValue({ id: 9, date: '2030-03-04' } as never)
    vi.mocked(createRecurringRule).mockResolvedValue({ id: 7, series_id: 'abc' })
    vi.mocked(generateRuleEvents).mockResolvedValue({ created: 12 })
  })

  it('sends the capacity with a recurring class', async () => {
    renderModal()
    await fillBasics()
    await userEvent.click(screen.getByLabelText('Recurring class'))
    await userEvent.click(screen.getByRole('button', { name: 'Mon' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create Recurring' }))

    // The capacity used to be left off the rule, so every class in the series
    // was created with a capacity of 0 whatever was typed.
    await waitFor(() => expect(createRecurringRule).toHaveBeenCalled())
    expect(vi.mocked(createRecurringRule).mock.calls[0][0]).toMatchObject({ capacity: 35, day_of_week: 0 })
  })

  it('does not offer notes for a recurring class, where they would not be kept', async () => {
    renderModal()
    await fillBasics()
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Recurring class'))

    expect(screen.queryByLabelText(/Notes/)).not.toBeInTheDocument()
    expect(screen.getByText(/Notes are kept per class/)).toBeInTheDocument()
  })

  it('saves capacity and notes on a single class', async () => {
    renderModal()
    await fillBasics()
    await userEvent.type(screen.getByLabelText(/Notes/), 'Bring a towel')
    await userEvent.click(screen.getByRole('button', { name: 'Add Class' }))

    await waitFor(() => expect(createEvent).toHaveBeenCalled())
    expect(vi.mocked(createEvent).mock.calls[0][0]).toMatchObject({ capacity: 35, notes: 'Bring a towel' })
  })
})
