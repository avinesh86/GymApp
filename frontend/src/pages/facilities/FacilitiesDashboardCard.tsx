import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Wrench } from 'lucide-react'
import { getFacilitiesSummary } from '../../api/facilities'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { ReportFaultModal } from './ReportFaultModal'
import { FAULT_STATUS } from './labels'

/**
 * The gym's chosen key people see open faults at a glance; everyone else gets
 * the Report a fault button and a link to the status board.
 */
export function FacilitiesDashboardCard() {
  const navigate = useNavigate()
  const { data: config } = useFacilitiesConfig()
  const [reporting, setReporting] = useState(false)
  const showSummary = !!config?.maintenance_enabled && !!config?.can_manage && !!config?.is_alert_recipient

  const { data: summary } = useQuery({
    queryKey: ['facilities', 'summary'],
    queryFn: getFacilitiesSummary,
    enabled: showSummary,
  })

  if (!config) return null
  if (!showSummary && !config.fault_reporting_enabled) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6" data-testid="facilities-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            {showSummary ? 'Open Faults' : 'Maintenance'}
          </h2>
          {showSummary && summary && summary.open_faults > 0 && (
            <Badge variant={summary.out_of_use > 0 ? 'red' : 'orange'}>{summary.open_faults}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {config.fault_reporting_enabled && (
            <Button size="sm" onClick={() => setReporting(true)}>Report a fault</Button>
          )}
          <button
            onClick={() => navigate(config.can_manage ? '/facilities' : '/faults')}
            className="text-xs text-cyan-600 hover:text-cyan-800"
          >
            {config.can_manage ? 'View Facilities' : 'See maintenance status'} &rsaquo;
          </button>
        </div>
      </div>

      {showSummary && summary && (
        summary.latest.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No open faults</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {summary.latest.map((f) => (
              <li key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{f.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {[f.equipment_name || f.location, f.site_name].filter(Boolean).join(' · ')} ·{' '}
                    {format(parseISO(f.created_at), 'd MMM')}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {f.severity === 'out_of_use' && <Badge variant="red">Out of use</Badge>}
                  <Badge variant={FAULT_STATUS[f.status].variant}>{FAULT_STATUS[f.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      <ReportFaultModal isOpen={reporting} onClose={() => setReporting(false)} />
    </div>
  )
}
