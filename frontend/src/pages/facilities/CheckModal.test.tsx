import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckModal } from './CheckModal'
import { completeChecklistRun, uploadCheckPhoto } from '../../api/facilities'
import type { ChecklistRun } from '../../types'

vi.mock('../../api/facilities', () => ({
  completeChecklistRun: vi.fn(),
  uploadCheckPhoto: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const run: ChecklistRun = {
  id: 9,
  template: 1,
  template_name: 'Opening check',
  category: 'opening',
  site: null,
  site_name: '',
  due_date: '2026-11-06',
  due_at: '2026-11-05T17:00:00Z',
  status: 'due',
  completed_at: null,
  completed_by_name: '',
  notes: '',
  can_complete: true,
  items: [
    { id: 1, text: 'Fire exits clear', equipment: null },
    { id: 2, text: 'Lat pulldown cable', equipment: 5, equipment_name: 'Lat pulldown' },
  ],
  answers: [],
  failed_count: 0,
}

function renderModal(r: ChecklistRun = run) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CheckModal run={r} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(completeChecklistRun).mockResolvedValue({
    ...run,
    status: 'done',
    completed_at: '2026-11-05T16:30:00Z',
    failed_count: 1,
    answers: [
      { id: 21, item: 1, item_text: 'Fire exits clear', equipment: null, equipment_name: '', passed: true, note: '', photo: null, fault: null, fault_status: '' },
      { id: 22, item: 2, item_text: 'Lat pulldown cable', equipment: 5, equipment_name: 'Lat pulldown', passed: false, note: 'Frayed', photo: null, fault: 3, fault_status: 'reported' },
    ],
  })
  vi.mocked(uploadCheckPhoto).mockResolvedValue()
})

describe('Doing a check', () => {
  it('needs Pass or Fail on every item before it can be finished', async () => {
    renderModal()
    const finish = screen.getByRole('button', { name: 'Finish check' })
    expect(finish).toBeDisabled()
    await userEvent.click(screen.getAllByRole('button', { name: 'Pass' })[0])
    expect(finish).toBeDisabled()
    await userEvent.click(screen.getAllByRole('button', { name: 'Pass' })[1])
    expect(finish).toBeEnabled()
  })

  it('a fail asks what is wrong, takes a photo, and sends both', async () => {
    const onClose = renderModal()
    await userEvent.click(screen.getAllByRole('button', { name: 'Pass' })[0])
    await userEvent.click(screen.getAllByRole('button', { name: 'Fail' })[1])
    await userEvent.type(screen.getByLabelText("What's wrong: Lat pulldown cable"), 'Frayed')
    const photo = new File(['img'], 'cable.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Photo: Lat pulldown cable'), photo)

    await userEvent.click(screen.getByRole('button', { name: 'Finish check' }))

    await waitFor(() =>
      expect(completeChecklistRun).toHaveBeenCalledWith(
        9,
        [
          { item: 1, passed: true, note: '' },
          { item: 2, passed: false, note: 'Frayed' },
        ],
        '',
      ),
    )
    await waitFor(() => expect(uploadCheckPhoto).toHaveBeenCalledWith(22, photo))
    expect(onClose).toHaveBeenCalled()
  })

  it('a done check shows what was found, read-only', () => {
    renderModal({
      ...run,
      status: 'late',
      completed_at: '2026-11-05T18:00:00Z',
      completed_by_name: 'Tia Leader',
      answers: [
        { id: 21, item: 1, item_text: 'Fire exits clear', equipment: null, equipment_name: '', passed: true, note: '', photo: null, fault: null, fault_status: '' },
        { id: 22, item: 2, item_text: 'Lat pulldown cable', equipment: 5, equipment_name: '', passed: false, note: 'Frayed', photo: null, fault: 3, fault_status: 'reported' },
      ],
    })
    expect(screen.getByText(/Tia Leader/)).toBeInTheDocument()
    expect(screen.getByText('Done late')).toBeInTheDocument()
    expect(screen.getByText('Sent to Maintenance')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finish check' })).not.toBeInTheDocument()
  })
})
