import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChecklistModal } from './ChecklistModal'
import { getChecklist, updateChecklist } from '../../api/facilities'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import type { ChecklistTemplate, FacilitiesConfig } from '../../types'

vi.mock('../../api/facilities', () => ({
  createChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  getChecklist: vi.fn(),
  listEquipment: vi.fn().mockResolvedValue([]),
  updateChecklist: vi.fn(),
}))
vi.mock('../../api/settings', () => ({
  getTenantSettings: vi.fn().mockResolvedValue({ checklist_roles: ['owner', 'gym_manager', 'team_leader'] }),
}))
vi.mock('../../hooks/useFacilitiesConfig', () => ({ useFacilitiesConfig: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const config = {
  equipment_enabled: false,
  checklists_enabled: true,
  can_manage_checklists: true,
  sites: [],
} as unknown as FacilitiesConfig

const opening: ChecklistTemplate = {
  id: 5,
  site: null,
  site_name: '',
  name: 'Opening check',
  category: 'opening',
  description: '',
  equipment: null,
  equipment_name: '',
  frequency: 'daily',
  weekdays: [],
  interval_days: 1,
  start_date: '2026-11-01',
  due_time: '06:00:00',
  assigned_roles: [],
  is_active: true,
  items: [{ id: 1, text: 'Fire exits clear', equipment: null }] as ChecklistTemplate['items'],
  open_overdue_count: 0,
}

function renderModal(template: ChecklistTemplate) {
  vi.mocked(useFacilitiesConfig).mockReturnValue({ data: config } as ReturnType<typeof useFacilitiesConfig>)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui = (isOpen: boolean) => (
    <QueryClientProvider client={client}>
      <ChecklistModal template={template} isOpen={isOpen} site="" onClose={vi.fn()} />
    </QueryClientProvider>
  )
  const view = render(ui(true))
  return {
    close: () => view.rerender(ui(false)),
    // The list refreshed: same checklist, new object.
    refreshed: () =>
      view.rerender(
        <QueryClientProvider client={client}>
          <ChecklistModal template={{ ...template }} isOpen site="" onClose={vi.fn()} />
        </QueryClientProvider>,
      ),
  }
}

async function pauseAndSave() {
  await userEvent.click(screen.getByRole('checkbox', { name: /Active/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('Pausing a checklist with overdue checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateChecklist).mockResolvedValue(opening)
  })

  it('asks first, counting the overdue checks afresh, and saves only on "Pause anyway"', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 2 })
    renderModal({ ...opening, open_overdue_count: 0 }) // the list's count is out of date

    await pauseAndSave()

    expect(
      await screen.findByText('2 overdue checks will be dropped from the dashboard and overdue alerts. Pause anyway?'),
    ).toBeInTheDocument()
    expect(getChecklist).toHaveBeenCalledWith(5)
    expect(updateChecklist).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Pause anyway' }))

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateChecklist).mock.calls[0][1]).toMatchObject({ is_active: false })
    expect(vi.mocked(updateChecklist).mock.calls[0][1]).not.toHaveProperty('open_overdue_count')
  })

  it('says "check" for one', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 1 })
    renderModal(opening)

    await pauseAndSave()

    expect(await screen.findByText(/^1 overdue check will be dropped/)).toBeInTheDocument()
  })

  it('keeps it active and unsaved when they back out, with Active ticked again', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 3 })
    renderModal(opening)

    await pauseAndSave()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it active' }))

    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
    expect(updateChecklist).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /Active/ })).toBeChecked()

    // Saving other changes now keeps it active, without asking again.
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateChecklist).mock.calls[0][1]).toMatchObject({ is_active: true })
    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
  })

  it.each([0, 2])('does nothing if the form is closed while counting (%i overdue)', async (count) => {
    let answer: (t: ChecklistTemplate) => void = () => {}
    vi.mocked(getChecklist).mockReturnValue(new Promise((r) => (answer = r)))
    const { close } = renderModal(opening)

    await pauseAndSave()
    close() // Cancel while the count is on its way
    answer({ ...opening, open_overdue_count: count })
    await new Promise((r) => setTimeout(r, 20))

    expect(updateChecklist).not.toHaveBeenCalled()
    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
  })

  it('saves straight away when nothing is overdue', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 0 })
    renderModal(opening)

    await pauseAndSave()

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
  })

  it('still asks when the checklist list refreshes during the count', async () => {
    let answer: (t: ChecklistTemplate) => void = () => {}
    vi.mocked(getChecklist).mockReturnValue(new Promise((r) => (answer = r)))
    const { refreshed } = renderModal(opening)

    await pauseAndSave()
    refreshed()
    answer({ ...opening, open_overdue_count: 2 })

    expect(await screen.findByText(/^2 overdue checks will be dropped/)).toBeInTheDocument()
  })

  it('counts once when Save is clicked twice', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 0 })
    renderModal(opening)

    await userEvent.click(screen.getByRole('checkbox', { name: /Active/ }))
    const save = screen.getByRole('button', { name: 'Save' })
    save.click()
    save.click()

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(getChecklist).toHaveBeenCalledTimes(1)
  })

  it("doesn't pause unwarned if the count can't be checked", async () => {
    vi.mocked(getChecklist).mockRejectedValue(new Error('offline'))
    renderModal({ ...opening, open_overdue_count: 0 })

    await pauseAndSave()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Checklist not saved: couldn't count its overdue checks. Try again."))
    expect(updateChecklist).not.toHaveBeenCalled()
  })

  it('does not ask when saving other changes', async () => {
    renderModal({ ...opening, open_overdue_count: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))

    expect(getChecklist).not.toHaveBeenCalled()
    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
  })

  it('does not ask when switching a paused checklist back on', async () => {
    renderModal({ ...opening, is_active: false, open_overdue_count: 2 })

    await pauseAndSave() // ticks Active back on

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateChecklist).mock.calls[0][1]).toMatchObject({ is_active: true })
    expect(getChecklist).not.toHaveBeenCalled()
  })
})
