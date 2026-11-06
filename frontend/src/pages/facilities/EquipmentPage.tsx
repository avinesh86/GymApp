import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Check, Wrench, X } from 'lucide-react'
import { getEquipmentHistory, scanEquipment } from '../../api/facilities'
import { PageHeader } from '../../components/shared/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { EquipmentQr } from './EquipmentQr'
import { ReportFaultModal } from './ReportFaultModal'
import { EQUIPMENT_STATUS, FAULT_STATUS, SEVERITY } from './labels'
import type { EquipmentHistoryEvent } from '../../types'

/**
 * What a machine's QR label opens. Everyone signed in sees its status and
 * open faults and can report one; Facilities roles also see its full service
 * history — faults, repairs and checks.
 */
export function EquipmentPage() {
  const id = Number(useParams().id)
  const [reporting, setReporting] = useState(false)

  const { data: scan, isLoading, isError } = useQuery({
    queryKey: ['facilities', 'scan', id],
    queryFn: () => scanEquipment(id),
    enabled: Number.isFinite(id),
    retry: false,
  })
  const { data: history } = useQuery({
    queryKey: ['facilities', 'history', id],
    queryFn: () => getEquipmentHistory(id),
    enabled: !!scan?.can_see_history,
  })

  if (isLoading) return <PageSpinner />
  if (isError || !scan) {
    return <EmptyState title="Equipment not found" description="This machine isn't in the register, or equipment tracking is switched off." />
  }

  const status = EQUIPMENT_STATUS[scan.status]
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={scan.name}
        subtitle={[scan.location, scan.site_name, scan.asset_tag].filter(Boolean).join(' · ')}
        actions={
          scan.can_report ? (
            <Button leftIcon={<Wrench className="h-4 w-4" />} onClick={() => setReporting(true)}>
              Report a fault
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-600">Status:</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Open faults ({scan.open_faults.length})</h2>
        {scan.open_faults.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing reported — it should be good to use.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Open faults">
            {scan.open_faults.map((f) => (
              <li key={f.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                  <Badge variant={FAULT_STATUS[f.status].variant}>{FAULT_STATUS[f.status].label}</Badge>
                  {f.severity === 'out_of_use' && <Badge variant={SEVERITY.out_of_use.variant}>Do not use</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Reported {format(parseISO(f.created_at), 'd MMM')}
                  {f.reported_by_name && ` by ${f.reported_by_name}`}
                </p>
                {f.status_note && <p className="text-sm text-gray-700 mt-2">Update: {f.status_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {scan.can_see_history && (
        <>
          <section className="mb-8 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">QR label</h2>
            <EquipmentQr id={scan.id} name={scan.name} assetTag={scan.asset_tag} />
          </section>
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Service history</h2>
            {!history ? (
              <PageSpinner />
            ) : history.events.length === 0 ? (
              <p className="text-sm text-gray-500">No faults or checks recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-3" aria-label="Service history">
                {history.events.map((e) => (
                  <HistoryEvent key={`${e.kind}-${e.id}`} event={e} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <ReportFaultModal isOpen={reporting} onClose={() => setReporting(false)} equipmentId={scan.id} />
    </div>
  )
}

function HistoryEvent({ event }: { event: EquipmentHistoryEvent }) {
  const when = event.at ? format(parseISO(event.at), 'd MMM yyyy') : ''
  if (event.kind === 'fault') {
    return (
      <li className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="orange">Fault</Badge>
          <p className="text-sm font-semibold text-gray-900">{event.title}</p>
          <Badge variant={FAULT_STATUS[event.status].variant}>{FAULT_STATUS[event.status].label}</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {when}
          {event.by && ` · reported by ${event.by}`}
          {event.resolved_at && ` · fixed ${format(parseISO(event.resolved_at), 'd MMM yyyy')}`}
          {event.resolved_by && ` by ${event.resolved_by}`}
          {event.repair_cost && ` · cost $${event.repair_cost}`}
        </p>
        {event.status_note && <p className="text-sm text-gray-700 mt-2">{event.status_note}</p>}
      </li>
    )
  }
  return (
    <li className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="cyan">Check</Badge>
        <p className="text-sm font-semibold text-gray-900">{event.title}</p>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {when}
        {event.by && ` · by ${event.by}`}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {event.lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {line.passed ? (
              <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" aria-label="Pass" />
            ) : (
              <X className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-label="Fail" />
            )}
            <span>
              {line.text}
              {line.note && <span className="text-gray-500"> — {line.note}</span>}
              {line.photo && (
                <a href={line.photo} target="_blank" rel="noreferrer" className="ml-2 text-cyan-700 underline">
                  photo
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}
