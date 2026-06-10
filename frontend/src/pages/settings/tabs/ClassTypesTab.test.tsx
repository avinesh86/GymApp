import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClassTypesTab } from './ClassTypesTab'
import { listClassTypes, createClassType, updateClassType } from '../../../api/timetable'
import { listSites } from '../../../api/settings'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../../api/timetable', () => ({
  listClassTypes: vi.fn(),
  createClassType: vi.fn(),
  updateClassType: vi.fn(),
  deleteClassType: vi.fn(),
}))
vi.mock('../../../api/settings', () => ({ listSites: vi.fn() }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ClassTypesTab />
    </QueryClientProvider>,
  )
}

describe('ClassTypesTab — colour picker (F11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listClassTypes).mockResolvedValue([
      { id: 1, name: 'Yoga', color: '#06b6d4', description: '', duration_minutes: 60, default_location: '', required_qualifications: '', red_threshold: 3, amber_threshold: 6, green_threshold: 10, purple_threshold: 20, is_active: true },
    ] as never)
    vi.mocked(listSites).mockResolvedValue([])
    vi.mocked(createClassType).mockResolvedValue({ id: 2 } as never)
    vi.mocked(updateClassType).mockResolvedValue({ id: 1 } as never)
  })

  it('shows a colour swatch in the class-type list', async () => {
    renderTab()
    const swatch = await screen.findByTestId('class-type-swatch')
    expect(swatch).toHaveStyle({ backgroundColor: '#06b6d4' })
  })

  it('lets you assign a colour when creating a class type', async () => {
    renderTab()
    await screen.findByTestId('class-type-swatch')

    await userEvent.click(screen.getByRole('button', { name: /add class type/i }))

    await userEvent.type(await screen.findByLabelText('Name'), 'Spin')
    fireEvent.change(screen.getByLabelText('Class colour'), { target: { value: '#ff0055' } })
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() =>
      expect(createClassType).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spin', color: '#ff0055' })),
    )
  })

  it('prefills the form when editing and saves the populated values', async () => {
    renderTab()
    await userEvent.click(await screen.findByLabelText('Edit Yoga'))

    // Regression: the edit form must load the existing data, not blanks.
    const nameInput = await screen.findByLabelText('Name')
    expect(nameInput).toHaveValue('Yoga')
    expect(screen.getByLabelText('Class colour')).toHaveValue('#06b6d4')

    fireEvent.change(screen.getByLabelText('Class colour'), { target: { value: '#123456' } })
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateClassType).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Yoga', color: '#123456' }),
      ),
    )
  })
})
