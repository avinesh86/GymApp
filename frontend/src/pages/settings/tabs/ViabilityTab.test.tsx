import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ViabilityTab } from './ViabilityTab'
import { listClassTypes, updateClassType } from '../../../api/timetable'

vi.mock('../../../api/timetable', () => ({
  listClassTypes: vi.fn(),
  updateClassType: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const SPRINT = {
  id: 4,
  name: 'Les Mills Sprint',
  amber_threshold: 9,
  green_threshold: 20,
  purple_threshold: 30,
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ViabilityTab />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listClassTypes).mockResolvedValue([SPRINT] as never)
  vi.mocked(updateClassType).mockResolvedValue(SPRINT as never)
})

describe('Settings → Viability', () => {
  it('asks where each colour starts, with no separate Red box', async () => {
    renderTab()
    expect(await screen.findByLabelText('Amber starts at')).toHaveValue(9)
    expect(screen.getByLabelText('Green starts at')).toHaveValue(20)
    expect(screen.getByLabelText('Purple starts at')).toHaveValue(30)
    expect(screen.queryByText(/\(below\)/i)).not.toBeInTheDocument()
  })

  it('spells out the people each colour covers', async () => {
    renderTab()
    const ranges = await screen.findByLabelText('Les Mills Sprint colour ranges')
    expect(within(ranges).getByText('Red 0–8')).toBeInTheDocument()
    expect(within(ranges).getByText('Amber 9–19')).toBeInTheDocument()
    expect(within(ranges).getByText('Green 20–29')).toBeInTheDocument()
    expect(within(ranges).getByText('Purple 30+')).toBeInTheDocument()
  })

  it('updates the ranges as you type, and saves the three numbers', async () => {
    renderTab()
    const amber = await screen.findByLabelText('Amber starts at')
    await userEvent.clear(amber)
    await userEvent.type(amber, '10')

    expect(screen.getByText('Red 0–9')).toBeInTheDocument()
    expect(screen.getByText('Amber 10–19')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save Thresholds' }))
    await waitFor(() =>
      expect(updateClassType).toHaveBeenCalledWith(4, {
        amber_threshold: 10,
        green_threshold: 20,
        purple_threshold: 30,
      }),
    )
  })

  it('will not save numbers that go backwards', async () => {
    renderTab()
    const green = await screen.findByLabelText('Green starts at')
    await userEvent.clear(green)
    await userEvent.type(green, '5')

    expect(screen.getByRole('alert')).toHaveTextContent('Green must start at or above where amber starts')
    expect(screen.getByRole('button', { name: 'Save Thresholds' })).toBeDisabled()
  })

  it('will not let amber start at 0, so an empty class is always red', async () => {
    renderTab()
    const amber = await screen.findByLabelText('Amber starts at')
    await userEvent.clear(amber)
    await userEvent.type(amber, '0')

    expect(screen.getByRole('alert')).toHaveTextContent('Amber must start at 1 or more')
    expect(screen.getByRole('button', { name: 'Save Thresholds' })).toBeDisabled()
  })
})
