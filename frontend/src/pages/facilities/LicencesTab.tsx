import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import {
  attachLicenceDocument,
  deleteLicence,
  listLicences,
  removeLicenceDocument,
  saveLicence,
  type LicenceInput,
} from '../../api/facilities'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { DocumentField, PersonSelect, ReminderDaysInput } from './RecordFields'
import { LICENCE_KIND, LICENCE_STATUS, options } from './labels'
import type { Licence } from '../../types'

function expiryText(l: Licence) {
  if (!l.expires_on) return '—'
  const when = format(parseISO(l.expires_on), 'd MMM yyyy')
  if (l.days_left === null) return when
  if (l.days_left < 0) return `${when} (${-l.days_left} days ago)`
  if (l.days_left === 0) return `${when} (today)`
  return `${when} (${l.days_left} days)`
}

export function LicencesTab({ site }: { site: number | '' }) {
  const { data: config } = useFacilitiesConfig()
  const [editing, setEditing] = useState<Licence | 'new' | null>(null)
  const { data: licences = [], isLoading } = useQuery({
    queryKey: ['facilities', 'licences', site],
    queryFn: () => listLicences({ site }),
  })

  return (
    <div>
      {config?.can_manage_records && (
        <div className="flex mb-4">
          <Button className="ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add licence
          </Button>
        </div>
      )}
      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table
            data={licences}
            keyExtractor={(l) => l.id}
            onRowClick={setEditing}
            emptyMessage="No licences recorded yet"
            columns={[
              { key: 'name', header: 'Licence', render: (l) => <span className="font-medium text-gray-900">{l.name}</span> },
              { key: 'kind', header: 'Type', render: (l) => LICENCE_KIND[l.kind] },
              { key: 'site', header: 'Site', render: (l) => l.site_name || 'Whole gym' },
              { key: 'expires', header: 'Expires', render: expiryText },
              {
                key: 'status',
                header: 'Status',
                render: (l) => <Badge variant={LICENCE_STATUS[l.status].variant}>{LICENCE_STATUS[l.status].label}</Badge>,
              },
              { key: 'cost', header: 'Cost', render: (l) => (l.cost ? `$${l.cost}` : '—') },
              { key: 'who', header: 'Responsible', render: (l) => l.responsible_name || '—' },
            ]}
          />
        </div>
      )}
      <LicenceModal
        licence={editing === 'new' ? null : editing}
        isOpen={editing !== null}
        site={site}
        readOnly={!config?.can_manage_records}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

const BLANK: LicenceInput = {
  name: '',
  kind: 'music',
  issuer: '',
  number: '',
  issued_on: null,
  expires_on: null,
  cost: null,
  responsible: null,
  notes: '',
  reminder_days: [60, 30, 7, 0],
}

function LicenceModal({
  licence,
  isOpen,
  site,
  readOnly,
  onClose,
}: {
  licence: Licence | null
  isOpen: boolean
  site: number | ''
  readOnly: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: config } = useFacilitiesConfig()
  const [form, setForm] = useState<LicenceInput>(BLANK)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setForm(licence ? { ...licence } : { ...BLANK, site: site || null })
    setFile(null)
  }, [isOpen, licence, site])

  const set = <K extends keyof LicenceInput>(key: K, value: LicenceInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['facilities', 'licences'] })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        site: form.site ?? null,
        name: form.name,
        kind: form.kind,
        issuer: form.issuer,
        number: form.number,
        issued_on: form.issued_on || null,
        expires_on: form.expires_on || null,
        cost: form.cost === '' ? null : form.cost ?? null,
        responsible: form.responsible ?? null,
        notes: form.notes,
        reminder_days: form.reminder_days,
      }
      const saved = await saveLicence(licence?.id, payload)
      if (file) await attachLicenceDocument(saved.id, file)
      return saved
    },
    onSuccess: () => {
      toast.success(licence ? 'Licence saved' : 'Licence added')
      refresh()
      onClose()
    },
    onError: () => toast.error('Could not save the licence. Check the details.'),
  })
  const remove = useMutation({
    mutationFn: () => deleteLicence(licence!.id),
    onSuccess: () => {
      toast.success('Licence removed')
      refresh()
      onClose()
    },
    onError: () => toast.error('Could not remove the licence'),
  })
  const dropDocument = useMutation({
    mutationFn: () => removeLicenceDocument(licence!.id),
    onSuccess: (updated) => {
      setForm((f) => ({ ...f, ...updated }))
      refresh()
      toast.success('Document removed')
    },
  })

  const sites = config?.sites ?? []
  const current = (form as Licence).document_url ?? null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={licence ? licence.name : 'Add licence'}
      size="xl"
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {licence && (
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
        )
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Name" placeholder="e.g. OneMusic licence" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <Select
          label="Type"
          value={form.kind ?? 'other'}
          onChange={(e) => set('kind', e.target.value as Licence['kind'])}
          options={options(LICENCE_KIND)}
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
        <Input label="Issued by" value={form.issuer ?? ''} onChange={(e) => set('issuer', e.target.value)} />
        <Input label="Licence number" value={form.number ?? ''} onChange={(e) => set('number', e.target.value)} />
        <Input label="Issued on" type="date" value={form.issued_on ?? ''} onChange={(e) => set('issued_on', e.target.value)} />
        <Input label="Expires on" type="date" value={form.expires_on ?? ''} onChange={(e) => set('expires_on', e.target.value)} />
        <Input
          label="Cost"
          type="number"
          min="0"
          step="0.01"
          value={form.cost ?? ''}
          onChange={(e) => set('cost', e.target.value)}
        />
        <PersonSelect value={form.responsible ?? null} onChange={(id) => set('responsible', id)} />
        <div className="sm:col-span-2">
          <ReminderDaysInput
            value={form.reminder_days ?? []}
            onChange={(days) => set('reminder_days', days)}
            hint="Days before expiry. Reminders go to the responsible person and your alert roles."
          />
        </div>
        <div className="sm:col-span-2">
          <DocumentField
            url={current}
            name={(form as Licence).document_name ?? ''}
            picked={file}
            onPick={setFile}
            onRemove={licence && !readOnly ? () => dropDocument.mutate() : undefined}
          />
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </fieldset>
    </Modal>
  )
}
