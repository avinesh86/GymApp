import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateCoverRequestModal } from './CreateCoverRequestModal'
import { createCoverRequest } from '../../api/cover'
import { listEventsPaginated } from '../../api/timetable'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('../../api/cover', () => ({ createCoverRequest: vi.fn() }))
vi.mock('../../api/timetable', () => ({ listEventsPaginated: vi.fn() }))

function ev(id: number, name: string) {
  return { id, class_type_name: name, date: '2099-06-09', start_time: '09:00', end_time: '10:00' }
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CreateCoverRequestModal isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('CreateCoverRequestModal — prolonged absence (F-cover)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createCoverRequest).mockResolvedValue({ id: 1 } as never)
    vi.mocked(listEventsPaginated).mockResolvedValue({
      count: 2, next: null, previous: null, results: [ev(11, 'Yoga'), ev(12, 'Spin')],
    } as never)
  })

  it('collates classes in range and select-all + create raises one request per class', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Prolonged absence' }))

    // Classes in the range are listed.
    expect(await screen.findByText(/Yoga/)).toBeInTheDocument()
    expect(screen.getByText(/Spin/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))
    await userEvent.click(screen.getByRole('button', { name: /create 2 requests/i }))

    await waitFor(() => expect(createCoverRequest).toHaveBeenCalledTimes(2))
    const ids = vi.mocked(createCoverRequest).mock.calls.map((c) => c[0].timetable_event).sort()
    expect(ids).toEqual([11, 12])
  })

  it('keeps single-class mode as the default', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Create Request' })).toBeInTheDocument()
  })
})
