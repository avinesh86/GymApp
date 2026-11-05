import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { createEquipment, deleteEquipment, listEquipment, updateEquipment } from '../../api/facilities'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { CATEGORY_LABELS, EQUIPMENT_STATUS, options } from './labels'
import type { Equipment } from '../../types'

type Draft = Partial<Equipment>

const EMPTY: Draft = { name: '', category: 'other', status: 'in_service', site: null }

export function EquipmentTab({ site }: { site: number | '' }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['facilities', 'equipment', site, status, search],
    queryFn: () => listEquipment({ site, status: status || undefined, search: search || undefined }),
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
        <div className="flex-1 max-w-sm">
          <Input label="Search" placeholder="Name, serial or asset tag" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-48">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Any status"
            options={options(EQUIPMENT_STATUS)}
          />
        </div>
        <Button className="sm:ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...EMPTY, site: site || null })}>
          Add equipment
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table
            data={equipment}
            keyExtractor={(e) => e.id}
            onRowClick={(e) => setEditing(e)}
            emptyMessage="No equipment yet — press Add equipment to start the register."
            columns={[
              { key: 'name', header: 'Name', render: (e) => <span className="font-medium text-gray-900">{e.name}</span> },
              { key: 'category', header: 'Category', render: (e) => CATEGORY_LABELS[e.category] },
              { key: 'location', header: 'Location', render: (e) => [e.location, e.site_name].filter(Boolean).join(' · ') || '—' },
              {
                key: 'status',
                header: 'Status',
                render: (e) => <Badge variant={EQUIPMENT_STATUS[e.status].variant}>{EQUIPMENT_STATUS[e.status].label}</Badge>,
              },
              { key: 'faults', header: 'Open faults', render: (e) => (e.open_fault_count ? e.open_fault_count : '—') },
              { key: 'warranty', header: 'Warranty until', render: (e) => e.warranty_expires ?? '—' },
            ]}
          />
        </div>
      )}

      <EquipmentModal draft={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function EquipmentModal({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: config } = useFacilitiesConfig()
  const [form, setForm] = useState<Draft>(EMPTY)

  useEffect(() => {
    if (draft) setForm(draft)
  }, [draft])

  const isNew = !draft?.id
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((f) => ({ ...f, [key]: value }))
  const done = (message: string) => {
    toast.success(message)
    queryClient.invalidateQueries({ queryKey: ['facilities'] })
    onClose()
  }

  // Never send the photo field as JSON; uploads come later.
  const payload = () => {
    const { photo: _photo, open_fault_count: _c, site_name: _s, ...rest } = form
    return {
      ...rest,
      purchase_date: rest.purchase_date || null,
      warranty_expires: rest.warranty_expires || null,
      purchase_cost: rest.purchase_cost === '' ? null : rest.purchase_cost,
    }
  }

  const save = useMutation({
    mutationFn: () => (isNew ? createEquipment(payload()) : updateEquipment(draft!.id!, payload())),
    onSuccess: () => done(isNew ? 'Equipment added' : 'Equipment saved'),
    onError: () => toast.error('Could not save the equipment'),
  })
  const remove = useMutation({
    mutationFn: () => deleteEquipment(draft!.id!),
    onSuccess: () => done('Equipment removed'),
    onError: () => toast.error('Could not remove the equipment'),
  })

  const sites = config?.sites ?? []

  return (
    <Modal
      isOpen={draft !== null}
      onClose={onClose}
      title={isNew ? 'Add equipment' : form.name || 'Equipment'}
      size="xl"
      footer={
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
              Remove
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={!form.name?.trim()}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Name" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <Select
          label="Category"
          value={form.category ?? 'other'}
          onChange={(e) => set('category', e.target.value as Equipment['category'])}
          options={options(CATEGORY_LABELS)}
        />
        {sites.length > 0 && (
          <Select
            label="Site"
            value={form.site ? String(form.site) : ''}
            onChange={(e) => set('site', e.target.value ? Number(e.target.value) : null)}
            placeholder="Whole gym"
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        )}
        <Input label="Location" placeholder="e.g. Cardio floor" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} />
        <Select
          label="Status"
          value={form.status ?? 'in_service'}
          onChange={(e) => set('status', e.target.value as Equipment['status'])}
          options={options(EQUIPMENT_STATUS)}
        />
        <Input label="Manufacturer" value={form.manufacturer ?? ''} onChange={(e) => set('manufacturer', e.target.value)} />
        <Input label="Model" value={form.model_number ?? ''} onChange={(e) => set('model_number', e.target.value)} />
        <Input label="Serial number" value={form.serial_number ?? ''} onChange={(e) => set('serial_number', e.target.value)} />
        <Input label="Asset tag" value={form.asset_tag ?? ''} onChange={(e) => set('asset_tag', e.target.value)} />
        <Input label="Supplier" value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
        <Input label="Purchase date" type="date" value={form.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value)} />
        <Input
          label="Purchase cost"
          type="number"
          min="0"
          step="0.01"
          value={form.purchase_cost ?? ''}
          onChange={(e) => set('purchase_cost', e.target.value)}
        />
        <Input label="Warranty until" type="date" value={form.warranty_expires ?? ''} onChange={(e) => set('warranty_expires', e.target.value)} />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </label>
      </div>
    </Modal>
  )
}
