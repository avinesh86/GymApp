import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Wrench } from 'lucide-react'
import { listFaultBoard } from '../../api/facilities'
import { PageHeader } from '../../components/shared/PageHeader'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { ReportFaultModal } from './ReportFaultModal'
import { FAULT_STATUS, SEVERITY } from './labels'
import type { FaultBoardItem } from '../../types'

/**
 * Maintenance (staff view): what's already been reported and how it's going, for
 * every staff member — so the same fault isn't logged five times and nobody
 * has to ask whether the rower is fixed yet.
 */
export function FaultBoardPage() {
  const { data: config, isLoading: configLoading } = useFacilitiesConfig()
  const [site, setSite] = useState('')
  const [reporting, setReporting] = useState(false)

  const { data: faults = [], isLoading } = useQuery({
    queryKey: ['facilities', 'fault-board', site],
    queryFn: () => listFaultBoard({ site: site ? Number(site) : '' }),
    enabled: !!config?.fault_reporting_enabled,
  })

  if (configLoading) return <PageSpinner />
  if (!config?.fault_reporting_enabled) return <Navigate to="/dashboard" replace />
  // Managers have the full view under Facilities → Maintenance.
  if (config.can_manage) return <Navigate to="/facilities" replace />

  const open = faults.filter((f) => f.status !== 'resolved')
  const fixed = faults.filter((f) => f.status === 'resolved')
  const sites = config.sites

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Maintenance"
        subtitle="Check here before reporting — if it's already listed, the team is on it."
        actions={<Button onClick={() => setReporting(true)} leftIcon={<Wrench className="h-4 w-4" />}>Report a fault</Button>}
      />

      {sites.length > 1 && (
        <div className="max-w-xs mb-4">
          <Select
            label="Site"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="All sites"
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Open ({open.length})</h2>
            {open.length === 0 ? (
              <EmptyState title="No open faults" description="Everything reported has been fixed." />
            ) : (
              <ul className="flex flex-col gap-3" aria-label="Open faults">
                {open.map((f) => (
                  <FaultRow key={f.id} fault={f} />
                ))}
              </ul>
            )}
          </section>
          {fixed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Fixed in the last 2 weeks</h2>
              <ul className="flex flex-col gap-3" aria-label="Recently fixed">
                {fixed.map((f) => (
                  <FaultRow key={f.id} fault={f} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ReportFaultModal isOpen={reporting} onClose={() => setReporting(false)} />
    </div>
  )
}

function FaultRow({ fault }: { fault: FaultBoardItem }) {
  const where = [fault.equipment_name || fault.location, fault.site_name].filter(Boolean).join(' · ')
  return (
    <li className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{fault.title}</p>
          <Badge variant={FAULT_STATUS[fault.status].variant}>{FAULT_STATUS[fault.status].label}</Badge>
          {fault.severity === 'out_of_use' && fault.status !== 'resolved' && (
            <Badge variant={SEVERITY.out_of_use.variant}>Do not use</Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {where} · reported {format(parseISO(fault.created_at), 'd MMM')}
          {fault.reported_by_name && ` by ${fault.reported_by_name}`}
        </p>
        {fault.status_note && <p className="text-sm text-gray-700 mt-2">Update: {fault.status_note}</p>}
      </div>
    </li>
  )
}
