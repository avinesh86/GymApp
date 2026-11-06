import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  createChecklist,
  deleteChecklist,
  getChecklist,
  listEquipment,
  updateChecklist,
  type ChecklistInput,
} from '../../api/facilities'
import { getTenantSettings } from '../../api/settings'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { CHECKLIST_CATEGORY, FREQUENCY, ROLE_LABELS, WEEKDAYS, options } from './labels'
import type { ChecklistTemplate, UserRole } from '../../types'

type Draft = ChecklistInput & { id?: number }

function blank(site: number | ''): Draft {
  return {
    name: '',
    category: 'opening',
    description: '',
    site: site || null,
    equipment: null,
    frequency: 'daily',
    weekdays: [],
    interval_days: 2,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    due_time: '09:00',
    assigned_roles: [],
    is_active: true,
    items: [{ text: '', equipment: null }],
  }
}

/** Setting a checklist up (owner, admin, gym manager). */
export function ChecklistModal({
  template,
  isOpen,
  site,
  onClose,
}: {
  template: ChecklistTemplate | null
  isOpen: boolean
  site: number | ''
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: config } = useFacilitiesConfig()
  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings, enabled: isOpen })
  const { data: equipment = [] } = useQuery({
    queryKey: ['facilities', 'equipment', 'all'],
    queryFn: () => listEquipment(),
    enabled: isOpen && !!config?.equipment_enabled,
  })
  const [form, setForm] = useState<Draft>(blank(site))

  // Overdue checks a pause would drop, waiting on "Pause anyway?".
  const [pauseWarning, setPauseWarning] = useState<number | null>(null)
  const [checkingPause, setCheckingPause] = useState(false)
  // Which opening of the form a recount belongs to: if the form is closed
  // (or reopened) while it runs, its answer is dropped, not saved.
  const session = useRef(0)

  useEffect(() => {
    session.current += 1
    if (!isOpen) return
    if (template) {
      const { id, site_name: _site, equipment_name: _equipment, open_overdue_count: _overdue, ...rest } = template
      setForm({ ...rest, id, due_time: template.due_time.slice(0, 5) })
    } else {
      setForm(blank(site))
    }
    setPauseWarning(null)
  }, [isOpen, template, site])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setItem = (index: number, patch: Partial<Draft['items'][number]>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }))

  const done = (message: string) => {
    toast.success(message)
    queryClient.invalidateQueries({ queryKey: ['facilities'] })
    onClose()
  }

  const save = useMutation({
    mutationFn: () => {
      const { id, ...body } = form
      const payload = { ...body, items: body.items.filter((i) => i.text.trim()) }
      return id ? updateChecklist(id, payload) : createChecklist(payload)
    },
    onSuccess: () => done(form.id ? 'Checklist saved' : 'Checklist added'),
    onError: () => toast.error('Could not save the checklist. Check the details.'),
  })
  // Pausing takes its overdue checks off the dashboard and out of overdue
  // alerts, so ask first. Recount just before, as the list may be old.
  const onSave = async () => {
    const pausing = !!template && template.is_active && !form.is_active
    if (!pausing) return save.mutate()
    const mine = session.current
    setCheckingPause(true)
    let overdue: number | null = null
    try {
      overdue = (await getChecklist(template.id)).open_overdue_count ?? 0
    } catch {
      // Unknown: don't pause without the warning it may need.
    } finally {
      setCheckingPause(false)
    }
    if (mine !== session.current) return // closed meanwhile: nothing to save
    if (overdue === null) {
      toast.error("Couldn't check for overdue checks. Try saving again.")
      return
    }
    if (overdue > 0) setPauseWarning(overdue)
    else save.mutate()
  }

  const remove = useMutation({
    mutationFn: () => deleteChecklist(form.id!),
    onSuccess: () => done('Checklist removed'),
    onError: () => toast.error('Could not remove the checklist'),
  })

  const roles = (settings?.checklist_roles ?? ['owner', 'admin', 'gym_manager', 'team_leader']) as UserRole[]
  const sites = config?.sites ?? []
  const equipmentOptions = equipment.map((e) => ({ value: String(e.id), label: e.name }))
  const canSave =
    form.name.trim() !== '' &&
    form.items.some((i) => i.text.trim()) &&
    (form.frequency !== 'weekly' || form.weekdays.length > 0)

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={form.id ? 'Edit checklist' : 'Add checklist'}
        size="xl"
        footer={
          <div className="flex items-center gap-2">
            {form.id && (
              <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
                Remove
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={onSave} isLoading={save.isPending || checkingPause} disabled={!canSave}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" placeholder="e.g. Opening check" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Select
              label="Type"
              value={form.category}
              onChange={(e) => set('category', e.target.value as Draft['category'])}
              options={options(CHECKLIST_CATEGORY)}
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
            {config?.equipment_enabled && (
              <Select
                label="For one machine (optional)"
                value={form.equipment ? String(form.equipment) : ''}
                onChange={(e) => set('equipment', e.target.value ? Number(e.target.value) : null)}
                placeholder="Not one machine"
                options={equipmentOptions}
              />
            )}
          </div>

          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <legend className="text-sm font-semibold text-gray-900 mb-2">How often</legend>
            <Select
              label="Frequency"
              value={form.frequency}
              onChange={(e) => set('frequency', e.target.value as Draft['frequency'])}
              options={options(FREQUENCY)}
            />
            <Input label="Done by" type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} />
            {form.frequency === 'weekly' && (
              <div className="sm:col-span-2">
                <p className="text-sm font-medium text-gray-700 mb-1">On</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((label, day) => (
                    <label key={label} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-cyan-500"
                        checked={form.weekdays.includes(day)}
                        onChange={() =>
                          set(
                            'weekdays',
                            form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort()
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {form.frequency === 'every_n_days' && (
              <Input
                label="Every how many days"
                type="number"
                min={1}
                max={365}
                value={form.interval_days}
                onChange={(e) => set('interval_days', Number(e.target.value))}
              />
            )}
            <Input
              label={form.frequency === 'daily' || form.frequency === 'weekly' ? 'Starting' : 'First due on'}
              hint={
                ['monthly', 'quarterly', 'yearly'].includes(form.frequency)
                  ? 'Repeats on this day of the month (the last day in shorter months)'
                  : undefined
              }
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 mb-1">Who does it</legend>
            <p className="text-xs text-gray-500 mb-2">Leave all unticked for everyone who does checklists.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {roles.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-cyan-500"
                    checked={form.assigned_roles.includes(role)}
                    onChange={() =>
                      set(
                        'assigned_roles',
                        form.assigned_roles.includes(role)
                          ? form.assigned_roles.filter((r) => r !== role)
                          : [...form.assigned_roles, role]
                      )
                    }
                  />
                  {ROLE_LABELS[role] ?? role}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 mb-2">What to check</legend>
            <ol className="flex flex-col gap-2">
              {form.items.map((item, index) => (
                <li key={item.id ?? `new-${index}`} className="flex flex-col sm:flex-row gap-2">
                  <input
                    aria-label={`Item ${index + 1}`}
                    placeholder="e.g. Fire exits clear"
                    value={item.text}
                    maxLength={300}
                    onChange={(e) => setItem(index, { text: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {config?.equipment_enabled && (
                    <select
                      aria-label={`Machine for item ${index + 1}`}
                      value={item.equipment ? String(item.equipment) : ''}
                      onChange={(e) => setItem(index, { equipment: e.target.value ? Number(e.target.value) : null })}
                      className="sm:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">No machine</option>
                      {equipmentOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => set('items', form.items.filter((_, i) => i !== index))}
                    className="p-2 text-gray-400 hover:text-red-600 self-start"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => set('items', [...form.items, { text: '', equipment: null }])}
            >
              Add item
            </Button>
          </fieldset>

          {form.id && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-cyan-500"
                checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)}
              />
              Active (untick to pause it without losing its history)
            </label>
          )}
        </div>
      </Modal>
      <ConfirmDialog
          isOpen={pauseWarning !== null}
          onClose={() => {
        // Keeping it active ticks the box again, so the next Save doesn't
        // ask (or pause) all over again.
        setPauseWarning(null)
        set('is_active', true)
      }}
          onConfirm={() => {
            setPauseWarning(null)
            save.mutate()
          }}
          title="Pause this checklist?"
          message={`${pauseWarning} overdue check${pauseWarning === 1 ? '' : 's'} will be hidden from the dashboard and overdue alerts while it's paused. Pause anyway?`}
          confirmLabel="Pause anyway"
          cancelLabel="Keep it active"
        />
    </>
  )
}
