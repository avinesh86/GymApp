import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/shared/PageHeader'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { EquipmentTab } from './EquipmentTab'
import { MaintenanceTab } from './MaintenanceTab'
import { ChecklistsTab } from './ChecklistsTab'
import { LicencesTab } from './LicencesTab'
import { SubscriptionsTab } from './SubscriptionsTab'

type TabKey = 'maintenance' | 'checklists' | 'equipment' | 'licences' | 'subscriptions'

const TAB_KEYS: TabKey[] = ['maintenance', 'checklists', 'equipment', 'licences', 'subscriptions']

/** Facilities: owner, admin, gym manager, team leader and payroll. */
export function FacilitiesPage() {
  const { data: config, isLoading } = useFacilitiesConfig()
  // The tab lives in the address (?tab=checklists) so links elsewhere, such
  // as the dashboard's checks card, can open a particular tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const fromUrl = searchParams.get('tab')
  const chosen = TAB_KEYS.find((k) => k === fromUrl) ?? null
  const setChosen = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }
  const [site, setSite] = useState('')

  if (isLoading || !config) return <PageSpinner />

  const tabs: { key: TabKey; label: string }[] = [
    ...(config.maintenance_enabled ? [{ key: 'maintenance' as const, label: 'Maintenance' }] : []),
    ...(config.checklists_enabled ? [{ key: 'checklists' as const, label: 'Checklists' }] : []),
    ...(config.equipment_enabled ? [{ key: 'equipment' as const, label: 'Equipment' }] : []),
    ...(config.licences_enabled ? [{ key: 'licences' as const, label: 'Licences' }] : []),
    ...(config.subscriptions_enabled ? [{ key: 'subscriptions' as const, label: 'Subscriptions' }] : []),
  ]
  const active = tabs.find((t) => t.key === chosen)?.key ?? tabs[0]?.key
  const siteId = site ? Number(site) : ''

  return (
    <div>
      <PageHeader title="Facilities" />

      {tabs.length === 0 ? (
        <EmptyState
          title="Facilities is switched off"
          description="Turn on maintenance, checklists, equipment, licences or subscriptions in Settings → Facilities."
        />
      ) : (
        <>
          <div className="flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div className="flex flex-1 gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active === tab.key}
                  onClick={() => setChosen(tab.key)}
                  className={[
                    'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
                    active === tab.key
                      ? 'border-cyan-500 text-cyan-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {config.sites.length > 1 && (
              <div className="w-full sm:w-56">
                <Select
                  aria-label="Site"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="All sites"
                  options={config.sites.map((s) => ({ value: String(s.id), label: s.name }))}
                />
              </div>
            )}
          </div>

          {active === 'maintenance' && <MaintenanceTab site={siteId} />}
          {active === 'checklists' && <ChecklistsTab site={siteId} />}
          {active === 'equipment' && <EquipmentTab site={siteId} />}
          {active === 'licences' && <LicencesTab site={siteId} />}
          {active === 'subscriptions' && <SubscriptionsTab site={siteId} />}
        </>
      )}
    </div>
  )
}
