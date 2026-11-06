import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { FacilitiesPage } from './FacilitiesPage'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import type { FacilitiesConfig } from '../../types'

vi.mock('../../hooks/useFacilitiesConfig', () => ({ useFacilitiesConfig: vi.fn() }))
vi.mock('./MaintenanceTab', () => ({ MaintenanceTab: () => <p>Maintenance content</p> }))
vi.mock('./ChecklistsTab', () => ({ ChecklistsTab: () => <p>Checklists content</p> }))
vi.mock('./EquipmentTab', () => ({ EquipmentTab: () => <p>Equipment content</p> }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

function renderPage(url: string) {
  vi.mocked(useFacilitiesConfig).mockReturnValue({
    data: {
      maintenance_enabled: true,
      checklists_enabled: true,
      equipment_enabled: true,
      sites: [],
    } as unknown as FacilitiesConfig,
    isLoading: false,
  } as ReturnType<typeof useFacilitiesConfig>)
  render(
    <MemoryRouter initialEntries={[url]}>
      <FacilitiesPage />
      <Where />
    </MemoryRouter>,
  )
}

describe('Facilities tabs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the first tab by default', () => {
    renderPage('/facilities')

    expect(screen.getByText('Maintenance content')).toBeInTheDocument()
  })

  it('opens the tab named in the address, so links can go straight to Checklists', () => {
    renderPage('/facilities?tab=checklists')

    expect(screen.getByRole('tab', { name: 'Checklists' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Checklists content')).toBeInTheDocument()
  })

  it('ignores a tab that is unknown or switched off', () => {
    renderPage('/facilities?tab=nonsense')

    expect(screen.getByText('Maintenance content')).toBeInTheDocument()
  })

  it('keeps the chosen tab in the address', async () => {
    renderPage('/facilities')

    await userEvent.click(screen.getByRole('tab', { name: 'Equipment' }))

    expect(screen.getByText('Equipment content')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('?tab=equipment')
  })
})
