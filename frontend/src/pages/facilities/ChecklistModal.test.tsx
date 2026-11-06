import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
  render(
    <QueryClientProvider client={client}>
      <ChecklistModal template={template} isOpen site="" onClose={vi.fn()} />
    </QueryClientProvider>,
  )
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

  it('keeps it active and unsaved when they back out', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 3 })
    renderModal(opening)

    await pauseAndSave()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep it active' }))

    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
    expect(updateChecklist).not.toHaveBeenCalled()
  })

  it('saves straight away when nothing is overdue', async () => {
    vi.mocked(getChecklist).mockResolvedValue({ ...opening, open_overdue_count: 0 })
    renderModal(opening)

    await pauseAndSave()

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Pause anyway\?/)).not.toBeInTheDocument()
  })

  it("falls back to the list's count if the recount fails", async () => {
    vi.mocked(getChecklist).mockRejectedValue(new Error('offline'))
    renderModal({ ...opening, open_overdue_count: 4 })

    await pauseAndSave()

    expect(await screen.findByText(/^4 overdue checks will be dropped/)).toBeInTheDocument()
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
