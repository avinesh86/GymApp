import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { listFaultBoard, listReportableEquipment, reportFault } from '../../api/facilities'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Badge } from '../../components/ui/Badge'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { useAuth } from '../../hooks/useAuth'
import { FAULT_STATUS, SEVERITY, options } from './labels'
import type { FaultSeverity } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Opened from a machine's QR page: that machine is already chosen. */
  equipmentId?: number
}

/**
 * Report a fault. Picking a machine first shows anything already reported on
 * it and how it's going, so staff don't log the same fault again.
 */
export function ReportFaultModal({ isOpen, onClose, equipmentId: presetEquipment }: Props) {
  const queryClient = useQueryClient()
  const { data: config } = useFacilitiesConfig()
  const { user } = useAuth()
  const loggedBy = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || ''
  const [equipmentId, setEquipmentId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<FaultSeverity>('medium')

  useEffect(() => {
    if (isOpen && presetEquipment) setEquipmentId(String(presetEquipment))
  }, [isOpen, presetEquipment])

  const { data: equipment = [] } = useQuery({
    queryKey: ['facilities', 'reportable-equipment'],
    queryFn: listReportableEquipment,
    enabled: isOpen && !!config?.equipment_enabled,
  })
  const { data: board = [] } = useQuery({
    queryKey: ['facilities', 'fault-board'],
    queryFn: () => listFaultBoard(),
    enabled: isOpen,
  })

  const alreadyReported = useMemo(
    () =>
      equipmentId
        ? board.filter((f) => String(f.equipment) === equipmentId && f.status !== 'resolved')
        : [],
    [board, equipmentId]
  )

  function reset() {
    setEquipmentId('')
    setSiteId('')
    setTitle('')
    setLocation('')
    setDescription('')
    setSeverity('medium')
  }

  function close() {
    reset()
    onClose()
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['facilities'] })
  }

  const submit = useMutation({
    mutationFn: () =>
      reportFault({
        equipment: equipmentId ? Number(equipmentId) : null,
        site: !equipmentId && siteId ? Number(siteId) : undefined,
        title: title.trim(),
        location: location.trim(),
        description: description.trim(),
        severity,
      }),
    onSuccess: () => {
      toast.success('Fault reported — thanks')
      refresh()
      close()
    },
    onError: () => toast.error('Could not report the fault. Check the details and try again.'),
  })

  const sites = config?.sites ?? []
  const canSubmit = title.trim() !== '' && (equipmentId !== '' || location.trim() !== '')

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Report a fault"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={() => submit.mutate()} isLoading={submit.isPending} disabled={!canSubmit}>
            Report fault
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {loggedBy && (
          <p className="text-sm text-gray-600" data-testid="logged-by">
            Logged by <span className="font-medium text-gray-900">{loggedBy}</span>
          </p>
        )}
        {config?.equipment_enabled && (
          <Select
            label="Equipment"
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            placeholder="Not a piece of equipment"
            options={equipment.map((e) => ({
              value: String(e.id),
              label: [e.name, e.location, e.site_name].filter(Boolean).join(' — '),
            }))}
          />
        )}

        {alreadyReported.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="already-reported">
            <p className="text-sm font-medium text-amber-900 mb-2">Already reported on this equipment</p>
            <ul className="flex flex-col gap-2">
              {alreadyReported.map((f) => (
                <li key={f.id} className="min-w-0">
                  <p className="text-sm text-gray-900">{f.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <Badge variant={FAULT_STATUS[f.status].variant}>{FAULT_STATUS[f.status].label}</Badge>
                    {f.reported_by_name && <span className="text-xs text-gray-600">by {f.reported_by_name}</span>}
                    {f.status_note && <span className="text-xs text-gray-600 truncate">· {f.status_note}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-800 mt-2">
              No need to report it again. If it's a different problem, carry on below.
            </p>
          </div>
        )}

        {!equipmentId && sites.length > 1 && (
          <Select
            label="Site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="Choose a site"
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        )}

        <Input
          label="What's wrong?"
          placeholder="e.g. Belt slipping, cable frayed"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        {!equipmentId && (
          <Input
            label="Where is it?"
            placeholder="e.g. Women's changing room"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        )}
        <Select
          label="How bad is it?"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as FaultSeverity)}
          options={options(SEVERITY)}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">More detail (optional)</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </label>
      </div>
    </Modal>
  )
}
