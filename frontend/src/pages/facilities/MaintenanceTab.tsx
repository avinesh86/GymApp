import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { Wrench } from 'lucide-react'
import { deleteFault, listFaults, updateFault } from '../../api/facilities'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { ReportFaultModal } from './ReportFaultModal'
import { FAULT_STATUS, SEVERITY, options } from './labels'
import type { FaultReport } from '../../types'

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  ...options(FAULT_STATUS),
]

export function MaintenanceTab({ site }: { site: number | '' }) {
  const { data: config } = useFacilitiesConfig()
  const [status, setStatus] = useState('open')
  const [selected, setSelected] = useState<FaultReport | null>(null)
  const [reporting, setReporting] = useState(false)

  const { data: faults = [], isLoading } = useQuery({
    queryKey: ['facilities', 'faults', site, status],
    queryFn: () => listFaults({ site, status: status || undefined }),
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
        <div className="w-full sm:w-48">
          <Select
            label="Show"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All faults"
            options={STATUS_FILTERS}
          />
        </div>
        {config?.fault_reporting_enabled && (
          <Button className="sm:ml-auto" leftIcon={<Wrench className="h-4 w-4" />} onClick={() => setReporting(true)}>
            Report a fault
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table
            data={faults}
            keyExtractor={(f) => f.id}
            onRowClick={setSelected}
            emptyMessage="No faults to show"
            columns={[
              { key: 'title', header: 'Fault', render: (f) => <span className="font-medium text-gray-900">{f.title}</span> },
              {
                key: 'where',
                header: 'Where',
                render: (f) => [f.equipment_name || f.location, f.site_name].filter(Boolean).join(' · '),
              },
              {
                key: 'severity',
                header: 'Severity',
                render: (f) => <Badge variant={SEVERITY[f.severity].variant}>{SEVERITY[f.severity].label}</Badge>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (f) => <Badge variant={FAULT_STATUS[f.status].variant}>{FAULT_STATUS[f.status].label}</Badge>,
              },
              {
                key: 'reported',
                header: 'Reported',
                render: (f) =>
                  `${format(parseISO(f.created_at), 'd MMM')}${f.reported_by_name ? ` · ${f.reported_by_name}` : ''}`,
              },
            ]}
          />
        </div>
      )}

      <FaultModal fault={selected} onClose={() => setSelected(null)} />
      <ReportFaultModal isOpen={reporting} onClose={() => setReporting(false)} />
    </div>
  )
}

function FaultModal({ fault, onClose }: { fault: FaultReport | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Partial<FaultReport>>({})

  useEffect(() => {
    if (fault) setForm(fault)
  }, [fault])

  const set = <K extends keyof FaultReport>(key: K, value: FaultReport[K]) => setForm((f) => ({ ...f, [key]: value }))
  const done = (message: string) => {
    toast.success(message)
    queryClient.invalidateQueries({ queryKey: ['facilities'] })
    onClose()
  }

  const save = useMutation({
    mutationFn: () =>
      updateFault(fault!.id, {
        status: form.status,
        severity: form.severity,
        status_note: form.status_note ?? '',
        assigned_to: form.assigned_to ?? '',
        internal_notes: form.internal_notes ?? '',
        repair_cost: form.repair_cost === '' ? null : form.repair_cost ?? null,
      }),
    onSuccess: () => done('Fault updated'),
    onError: () => toast.error('Could not update the fault'),
  })
  const remove = useMutation({
    mutationFn: () => deleteFault(fault!.id),
    onSuccess: () => done('Fault removed'),
    onError: () => toast.error('Could not remove the fault'),
  })

  if (!fault) return null
  const where = [fault.equipment_name || fault.location, fault.site_name].filter(Boolean).join(' · ')

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={fault.title}
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
            Remove
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} isLoading={save.isPending}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-600">
          <p>{where}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Reported {format(parseISO(fault.created_at), 'd MMM yyyy, h:mma')}
            {fault.reported_by_name && ` by ${fault.reported_by_name}`}
          </p>
          {fault.description && <p className="mt-2 whitespace-pre-line text-gray-800">{fault.description}</p>}
          {fault.resolved_at && (
            <p className="text-xs text-green-700 mt-2">
              Fixed {format(parseISO(fault.resolved_at), 'd MMM yyyy')}
              {fault.resolved_by_name && ` by ${fault.resolved_by_name}`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Status"
            value={form.status ?? 'reported'}
            onChange={(e) => set('status', e.target.value as FaultReport['status'])}
            options={options(FAULT_STATUS)}
          />
          <Select
            label="Severity"
            value={form.severity ?? 'medium'}
            onChange={(e) => set('severity', e.target.value as FaultReport['severity'])}
            options={options(SEVERITY)}
          />
        </div>
        <Input
          label="Update for staff"
          hint="Instructors and PTs see this under Maintenance, e.g. Technician booked for Thursday"
          value={form.status_note ?? ''}
          maxLength={300}
          onChange={(e) => set('status_note', e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Assigned to" value={form.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value)} />
          <Input
            label="Repair cost"
            type="number"
            min="0"
            step="0.01"
            value={form.repair_cost ?? ''}
            onChange={(e) => set('repair_cost', e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Internal notes</span>
          <textarea
            rows={3}
            value={form.internal_notes ?? ''}
            onChange={(e) => set('internal_notes', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <span className="text-xs text-gray-400">Only the Facilities team sees these.</span>
        </label>
      </div>
    </Modal>
  )
}
