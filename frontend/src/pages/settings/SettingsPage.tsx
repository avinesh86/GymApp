import React, { useState } from 'react'
import { GeneralTab } from './tabs/GeneralTab'
import { ClassTypesTab } from './tabs/ClassTypesTab'
import { ViabilityTab } from './tabs/ViabilityTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { AccessTab } from './tabs/AccessTab'
import { TimetableTab } from './tabs/TimetableTab'
import { LocationsTab } from './tabs/LocationsTab'
import { InvoicesTab } from './tabs/InvoicesTab'
import { RoleAccessTab } from './RoleAccessTab'
import { PageHeader } from '../../components/shared/PageHeader'

type TabKey =
  | 'general'
  | 'classes'
  | 'viability'
  | 'notifications'
  | 'access'
  | 'timetable'
  | 'locations'
  | 'invoices'
  | 'role_access'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'general',       label: 'General' },
  { key: 'classes',       label: 'Classes' },
  { key: 'viability',     label: 'Viability' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'access',        label: 'Access' },
  { key: 'timetable',     label: 'Timetable' },
  { key: 'locations',     label: 'Locations' },
  { key: 'invoices',      label: 'Invoices' },
  { key: 'role_access',   label: 'Access Control' },
]

const TAB_COMPONENTS: Record<TabKey, React.ReactNode> = {
  general:       <GeneralTab />,
  classes:       <ClassTypesTab />,
  viability:     <ViabilityTab />,
  notifications: <NotificationsTab />,
  access:        <AccessTab />,
  timetable:     <TimetableTab />,
  locations:     <LocationsTab />,
  invoices:      <InvoicesTab />,
  role_access:   <RoleAccessTab />,
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  return (
    <div>
      <PageHeader title="Settings" />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-cyan-500 text-cyan-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TAB_COMPONENTS[activeTab]}
    </div>
  )
}
