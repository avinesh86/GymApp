import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, Mail, Phone, Star, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  getStaff,
  updateStaff,
  deleteStaff,
  listPayRates,
  createPayRate,
  deletePayRate,
  updatePayRate,
  listPayRateOverrides,
  createPayRateOverride,
  deletePayRateOverride,
  listQualifications,
  createQualification,
  deleteQualification,
  listCapabilities,
  createCapability,
  deleteCapability,
  listClassRates,
  saveClassRates,
  type ClassRateChange,
  type ClassRateRow,
  type ClassRateType,
  listAvailability,
  createAvailability,
  deleteAvailability,
  getPaymentDetails,
  createOrUpdatePaymentDetails,
} from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import { useAuth } from '../../hooks/useAuth'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { StaffMember, UserRole } from '../../types'
import {
  AVAILABILITY_BANDS,
  AVAILABILITY_DAYS,
  availabilityCellKey,
  bandForStartTime,
  type AvailabilityBand,
} from './availabilityBands'
import { useGymTimezone } from '../../hooks/useGymTimezone'
import { gymNow } from '../../lib/gymTime'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'instructor',        label: 'Instructor' },
  { value: 'admin',             label: 'Admin' },
  { value: 'gym_manager',       label: 'Gym Manager' },
  { value: 'payroll',           label: 'Payroll' },
  { value: 'team_leader',       label: 'Team Leader' },
  { value: 'class_count_admin', label: 'Class Count Admin' },
]

const PRIORITY_TIER_OPTIONS = [
  { value: '1', label: 'Tier 1 (Highest Priority)' },
  { value: '2', label: 'Tier 2 (Second Priority)' },
  { value: '3', label: 'Tier 3' },
]

const ROLE_LABELS: Record<string, string> = {
  owner:            'Owner',
  admin:            'Admin',
  gym_manager:      'Gym Manager',
  payroll:          'Payroll',
  team_leader:      'Team Leader',
  instructor:       'Instructor',
  class_count_admin:'Class Count Admin',
}

const ROLE_BADGE_VARIANT: Record<string, 'blue' | 'purple' | 'green' | 'orange' | 'grey' | 'yellow'> = {
  owner:            'purple',
  admin:            'blue',
  gym_manager:      'purple',
  payroll:          'green',
  team_leader:      'orange',
  instructor:       'grey',
  class_count_admin:'grey',
}

const RATE_TYPE_OPTIONS = [
  { value: 'per_class', label: 'Per Class' },
  { value: 'per_head',  label: 'Per Head' },
  { value: 'blended',   label: 'Blended (Base + Per Head)' },
  { value: 'hourly',    label: 'Hourly' },
  { value: 'flat',      label: 'Flat' },
] as const

type RateType = typeof RATE_TYPE_OPTIONS[number]['value']

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'info' | 'availability' | 'classes' | 'pay-rates' | 'business'

// ─── Field helpers ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  /** id of the control, so the label is tied to it. */
  htmlFor?: string
  children: React.ReactNode
}

function FieldGroup({ label, htmlFor, children }: FieldProps) {
  const labelClass = 'text-xs font-medium text-gray-500 uppercase tracking-wide'
  if (htmlFor) {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={htmlFor} className={labelClass}>{label}</label>
        {children}
      </div>
    )
  }
  // No id to point at: wrap the control so the label still belongs to it.
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

// ─── Saving each tab ──────────────────────────────────────────────────────────

/** What every tab is given so the popup knows about unsaved edits and saves. */
interface TabSaveProps {
  /** Called whenever the tab gains or loses unsaved changes. */
  onDirtyChange: (dirty: boolean) => void
  /** Called after a save succeeds; the popup stays open and says so. */
  onSaved: () => void
}

/** Tells the popup when this tab's unsaved state changes. */
function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  // Leaving the tab (after the popup has checked) clears it.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
}

/** The same Save button at the foot of every tab; off until something changes. */
function TabFooter({
  dirty,
  isSaving,
  onSave,
  disabled = false,
  left,
}: {
  dirty: boolean
  isSaving: boolean
  onSave: () => void
  disabled?: boolean
  left?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4 mt-1 border-t border-gray-100">
      <div>{left}</div>
      <div className="flex items-center gap-3">
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <Button onClick={onSave} isLoading={isSaving} disabled={!dirty || disabled}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}

const inputClass =
  'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-cyan-400 w-full'

// ─── Info Tab ─────────────────────────────────────────────────────────────────

interface InfoTabProps extends TabSaveProps {
  staff: StaffMember
  onDeleted: () => void
}

function InfoTab({ staff, onSaved, onDeleted, onDirtyChange }: InfoTabProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // A role decides what someone can do in the gym: owners, gym managers and
  // admins change it.
  const canChangeRole = ['owner', 'gym_manager', 'admin'].includes(user?.role ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [email, setEmail] = useState(staff.email)
  const [phone, setPhone] = useState(staff.phone ?? '')
  const [role, setRole] = useState<UserRole>(staff.role)
  const [status, setStatus] = useState<StaffMember['status']>(staff.status)
  const [priorityTier, setPriorityTier] = useState(String(staff.priority_tier ?? 1))

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      updateStaff(staff.id, {
        email,
        phone,
        // Unchanged for anyone who can't edit it, so the save isn't refused.
        ...(canChangeRole ? { role } : {}),
        status,
        priority_tier: Number(priorityTier),
      }),
    onSuccess: (updated) => {
      // Put the saved record in the cache before the popup closes. Reopening
      // it otherwise starts from the copy fetched before the save, and the
      // form shows the old values even though they were stored.
      queryClient.setQueryData(['staff', staff.id], updated)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member updated')
      // The popup stays open: the user may have more tabs to fill in.
      onSaved()
    },
    onError: (error) => toast.error(extractApiError(error, 'Failed to update staff member')),
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteStaff(staff.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member removed')
      onDeleted()
    },
    onError: () => toast.error('Failed to delete staff member'),
  })

  const { data: qualifications = [] } = useQuery({
    queryKey: ['staff', staff.id, 'qualifications'],
    queryFn: () => listQualifications(staff.id),
  })

  const { mutate: removeQual } = useMutation({
    mutationFn: (qualId: number) => deleteQualification(staff.id, qualId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staff.id, 'qualifications'] })
      toast.success('Qualification removed')
    },
  })

  const [showAddQual, setShowAddQual] = useState(false)
  const [qualName, setQualName] = useState('')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  const dirty =
    email !== staff.email ||
    phone !== (staff.phone ?? '') ||
    role !== staff.role ||
    status !== staff.status ||
    priorityTier !== String(staff.priority_tier ?? 1) ||
    // A qualification typed in but not yet added would be lost too.
    (showAddQual && (qualName !== '' || issuedDate !== ''))
  useReportDirty(dirty, onDirtyChange)

  const { mutate: addQual } = useMutation({
    mutationFn: () =>
      createQualification(staff.id, {
        name: qualName,
        // issued_date / expiry_date are read-only aliases on the API; sent
        // under those names the dates were silently dropped.
        issued_at: issuedDate,
        expires_at: expiryDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staff.id, 'qualifications'] })
      toast.success('Qualification added')
      setShowAddQual(false)
      setQualName('')
      setIssuedDate('')
      setExpiryDate('')
    },
    onError: () => toast.error('Failed to add qualification'),
  })

  return (
    <div className="flex flex-col gap-5">
      {/* Two-column info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup label="Email">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Phone">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Not set"
              className={`${inputClass} pl-9`}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Role" htmlFor="staff-role">
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={!canChangeRole}
            title={canChangeRole ? undefined : 'Only an owner, gym manager or admin can change a role'}
            className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-500`}
          >
            {/* An owner isn't offered below; keep theirs showing as what it is. */}
            {!ROLE_OPTIONS.some((opt) => opt.value === role) && (
              <option value={role}>{ROLE_LABELS[role] ?? role}</option>
            )}
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Status" htmlFor="staff-status">
          <select
            id="staff-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StaffMember['status'])}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            {status === 'suspended' && <option value="suspended">Suspended</option>}
          </select>
        </FieldGroup>
      </div>

      {/* Priority Tier — full width */}
      <FieldGroup label="Priority Tier" htmlFor="staff-priority-tier">
        <select
          id="staff-priority-tier"
          value={priorityTier}
          onChange={(e) => setPriorityTier(e.target.value)}
          className={inputClass}
        >
          {PRIORITY_TIER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Used to prioritise this instructor when assigning cover or scheduling.
        </p>
      </FieldGroup>

      {/* Qualifications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Qualifications</h3>
          <button
            onClick={() => setShowAddQual(true)}
            className="text-xs text-cyan-600 hover:text-cyan-800 transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add Qualification
          </button>
        </div>
        {qualifications.length === 0 ? (
          <p className="text-xs text-gray-400">No qualifications recorded</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {qualifications.map((qual) => (
              <span
                key={qual.id}
                className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-xs font-medium"
              >
                {qual.name}
                <button
                  onClick={() => removeQual(qual.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {showAddQual && (
          <div className="mt-3 p-3 border border-gray-200 rounded-lg flex flex-col gap-2 bg-gray-50">
            <input
              type="text"
              placeholder="Qualification name"
              value={qualName}
              onChange={(e) => setQualName(e.target.value)}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Issued Date</label>
                <input
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Expiry (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddQual(false)}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5 rounded-lg border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => addQual()}
                disabled={!qualName || !issuedDate}
                className="text-xs text-white bg-gray-900 hover:bg-gray-700 transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <TabFooter
        dirty={dirty}
        isSaving={isSaving}
        onSave={() => save()}
        left={
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-red-500 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        }
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => remove()}
        title="Delete Staff Member"
        message={`Are you sure you want to delete ${staff.name || `${staff.first_name} ${staff.last_name}`.trim()}? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  )
}

// ─── Availability Tab ─────────────────────────────────────────────────────────

function AvailabilityTab({ staffId, onDirtyChange, onSaved }: { staffId: number } & TabSaveProps) {
  const queryClient = useQueryClient()

  const { data: availability = [], isLoading } = useQuery({
    queryKey: ['staff', staffId, 'availability'],
    queryFn: () => listAvailability(staffId),
  })

  const slotMap = new Map<string, number>()
  for (const slot of availability) {
    slotMap.set(availabilityCellKey(slot.day_of_week, bandForStartTime(slot.start_time)), slot.id)
  }

  // Ticks are edits until Save; null means "as saved".
  const [ticked, setTicked] = useState<Set<string> | null>(null)
  const current = ticked ?? new Set(slotMap.keys())
  const toAdd = [...current].filter((key) => !slotMap.has(key))
  const toRemove = [...slotMap.keys()].filter((key) => !current.has(key))
  const dirty = toAdd.length > 0 || toRemove.length > 0
  useReportDirty(dirty, onDirtyChange)

  function toggleSlot(cellKey: string) {
    const next = new Set(current)
    if (next.has(cellKey)) next.delete(cellKey)
    else next.add(cellKey)
    setTicked(next)
  }

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      for (const key of toRemove) await deleteAvailability(staffId, slotMap.get(key)!)
      for (const key of toAdd) {
        const [day, band] = key.split('-') // availabilityCellKey: "<day>-<band>"
        const slotDef = AVAILABILITY_BANDS.find((b) => b.key === band)!
        await createAvailability(staffId, {
          day_of_week: Number(day),
          start_time: slotDef.start,
          end_time: slotDef.end,
        })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'availability'] })
      setTicked(null)
      toast.success('Availability saved')
      onSaved()
    },
    onError: async (error) => {
      // Some slots may have saved before the failure; show what's stored.
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'availability'] })
      toast.error(extractApiError(error, 'Failed to save availability'))
    },
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading availability...</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">Set preferred availability for cover requests</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="w-28 pb-3" />
              {AVAILABILITY_BANDS.map((slot) => (
                <th key={slot.key} className="pb-3 text-center text-xs font-semibold text-gray-600">
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AVAILABILITY_DAYS.map((dayName, dayIndex) => (
              <tr key={dayName} className="border-t border-gray-50">
                <td className="py-3 text-sm text-gray-700 font-medium">{dayName}</td>
                {AVAILABILITY_BANDS.map((slotDef) => {
                  const cellKey = availabilityCellKey(dayIndex, slotDef.key)
                  return (
                    <td key={slotDef.key} className="py-3 text-center">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={current.has(cellKey)}
                          onChange={() => toggleSlot(cellKey)}
                          disabled={isSaving}
                          aria-label={`${dayName} ${slotDef.label}`}
                          className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                        />
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Checked slots indicate preferred availability for cover requests.
      </p>
      <TabFooter dirty={dirty} isSaving={isSaving} onSave={() => save()} />
    </div>
  )
}

// ─── Classes Tab ──────────────────────────────────────────────────────────────

/** Pull a human-readable message out of a DRF error response, falling back to
 *  a generic label. Without this, the user only ever sees "Failed to ...". */
export function extractApiError(error: unknown, fallback: string): string {
  let data = (error as { response?: { data?: unknown } })?.response?.data
  // The API wraps field errors as { detail: { field: [...] }, error: true }.
  // Unwrapped, every message fell through to the generic fallback.
  const wrapped = (data as { detail?: unknown } | undefined)?.detail
  if (wrapped && typeof wrapped === 'object') data = wrapped
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    const first = Object.values(record)[0]
    if (Array.isArray(first) && first.length > 0) return String(first[0])
    if (typeof first === 'string') return first
  }
  return fallback
}

const CLASS_RATE_TYPES: { value: ClassRateType; label: string }[] = [
  { value: 'per_class', label: 'Per class' },
  { value: 'per_head', label: 'Per head' },
  { value: 'blended', label: 'Base + per head' },
]

/** One row's editable rate. An empty rate type means the default pay rate applies. */
interface RateDraft {
  rate_type: ClassRateType | ''
  amount: string
  per_head_rate: string
}

function draftFromRow(row: ClassRateRow | undefined): RateDraft {
  const rate = row?.rate
  return rate
    ? { rate_type: rate.rate_type, amount: rate.amount, per_head_rate: rate.per_head_rate }
    : { rate_type: '', amount: '', per_head_rate: '' }
}

/** Compares as money, so "45" and "45.00" are the same. */
function sameDraft(a: RateDraft, b: RateDraft): boolean {
  const money = (v: string) => (v === '' ? 0 : Number(v))
  if (a.rate_type !== b.rate_type) return false
  if (a.rate_type === '') return true
  return money(a.amount) === money(b.amount) && money(a.per_head_rate) === money(b.per_head_rate)
}

const noop = () => {}

export function ClassesTab({
  staffId,
  onDirtyChange = noop,
  onSaved = noop,
}: { staffId: number } & Partial<TabSaveProps>) {
  const gymTz = useGymTimezone()
  const queryClient = useQueryClient()

  const { data: capabilities = [], isLoading: capsLoading } = useQuery({
    queryKey: ['staff', staffId, 'capabilities'],
    queryFn: () => listCapabilities(staffId),
  })

  const { data: classTypes = [], isLoading: ctLoading } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { data: rateRows = [] } = useQuery({
    queryKey: ['staff', staffId, 'class-rates'],
    queryFn: () => listClassRates(staffId),
  })

  // Ticks and rates are edits until Save. A null tick set means "as saved";
  // rows without a rate draft show the saved rate.
  const [tickedDraft, setTickedDraft] = useState<Set<number> | null>(null)
  const [drafts, setDrafts] = useState<Record<number, RateDraft>>({})
  const [startsFrom, setStartsFrom] = useState(() => format(gymNow(gymTz), 'yyyy-MM-dd'))

  const savedTicks = new Set(capabilities.map((c) => c.class_type))
  const capabilityByClassType = new Map(capabilities.map((c) => [c.class_type, c.id]))
  const ticked = tickedDraft ?? savedTicks
  const ticksToAdd = [...ticked].filter((id) => !savedTicks.has(id))
  const ticksToRemove = [...savedTicks].filter((id) => !ticked.has(id))

  const savedById = new Map(rateRows.map((r) => [r.class_type, r]))
  const draftFor = (classTypeId: number) => drafts[classTypeId] ?? draftFromRow(savedById.get(classTypeId))
  // Only rates for classes still ticked are saved.
  const changedIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => ticked.has(id) && !sameDraft(drafts[id], draftFromRow(savedById.get(id))))

  const dirty = ticksToAdd.length > 0 || ticksToRemove.length > 0 || changedIds.length > 0
  useReportDirty(dirty, onDirtyChange)

  function toggleTick(classTypeId: number) {
    const next = new Set(ticked)
    if (next.has(classTypeId)) next.delete(classTypeId)
    else next.add(classTypeId)
    setTickedDraft(next)
  }

  function editRate(classTypeId: number, patch: Partial<RateDraft>) {
    setDrafts((prev) => ({ ...prev, [classTypeId]: { ...draftFor(classTypeId), ...patch } }))
  }

  const missingAmount = changedIds.some((id) => {
    const d = drafts[id]
    if (d.rate_type === '') return false
    const needsBase = d.rate_type !== 'per_head'
    const needsHead = d.rate_type !== 'per_class'
    return (needsBase && d.amount === '') || (needsHead && d.per_head_rate === '')
  })

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      for (const id of ticksToRemove) await deleteCapability(staffId, capabilityByClassType.get(id)!)
      for (const id of ticksToAdd) await createCapability(staffId, { class_type: id })
      if (changedIds.length === 0) return null
      const changes: ClassRateChange[] = changedIds.map((id) => {
        const d = drafts[id]
        return d.rate_type === ''
          ? { class_type: id, rate_type: null }
          : { class_type: id, rate_type: d.rate_type, amount: d.amount || '0', per_head_rate: d.per_head_rate || '0' }
      })
      return saveClassRates(staffId, changes, startsFrom)
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] }),
        queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'class-rates'] }),
        queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rate-overrides'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      ])
      setTickedDraft(null)
      setDrafts({})
      const n = data?.drafts_repriced ?? 0
      toast.success(n > 0 ? `Classes saved · ${n} draft invoice${n === 1 ? '' : 's'} updated` : 'Classes saved')
      onSaved()
    },
    onError: async (error) => {
      // Some changes may have saved before the failure; show what's stored.
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId] })
      toast.error(extractApiError(error, 'Failed to save classes'))
    },
  })

  if (capsLoading || ctLoading) {
    return <p className="text-sm text-gray-400 py-6 text-center">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-500 mb-2">
        Tick the class types this instructor teaches, and set what they're paid for each. A class
        with no rate is paid at their default pay rate.
      </p>
      {classTypes.map((ct) => {
        const isTicked = ticked.has(ct.id)
        const draft = draftFor(ct.id)
        const saved = savedById.get(ct.id)?.rate
        return (
          <div
            key={ct.id}
            className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gray-100"
          >
            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-[10rem]">
              <input
                type="checkbox"
                checked={isTicked}
                onChange={() => toggleTick(ct.id)}
                disabled={isSaving}
                className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
              />
              <span className="text-sm text-gray-800">{ct.name}</span>
            </label>

            {isTicked && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`${ct.name} pay type`}
                  value={draft.rate_type}
                  onChange={(e) => {
                    const next = e.target.value as ClassRateType | ''
                    // Start the newly shown box empty rather than at a hidden $0.00.
                    const usesBase = (t: string) => t === 'per_class' || t === 'blended'
                    const usesHead = (t: string) => t === 'per_head' || t === 'blended'
                    editRate(ct.id, {
                      rate_type: next,
                      ...(usesBase(next) && !usesBase(draft.rate_type) ? { amount: '' } : {}),
                      ...(usesHead(next) && !usesHead(draft.rate_type) ? { per_head_rate: '' } : {}),
                    })
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 bg-white"
                >
                  <option value="">Default pay rate</option>
                  {CLASS_RATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {(draft.rate_type === 'per_class' || draft.rate_type === 'blended') && (
                  <MoneyInput
                    label={draft.rate_type === 'blended' ? `${ct.name} base` : `${ct.name} rate`}
                    value={draft.amount}
                    onChange={(v) => editRate(ct.id, { amount: v })}
                    suffix={draft.rate_type === 'blended' ? 'base' : 'per class'}
                  />
                )}
                {(draft.rate_type === 'per_head' || draft.rate_type === 'blended') && (
                  <MoneyInput
                    label={`${ct.name} per head`}
                    value={draft.per_head_rate}
                    onChange={(v) => editRate(ct.id, { per_head_rate: v })}
                    suffix="per head"
                  />
                )}
                {saved && !drafts[ct.id] && (
                  <span className="text-xs text-gray-400">since {saved.effective_from}</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      <label className="text-xs text-gray-500 mt-2 w-fit">
        New rates start from
        <input
          type="date"
          value={startsFrom}
          onChange={(e) => setStartsFrom(e.target.value)}
          className="mt-1 block rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900"
        />
      </label>
      <p className="text-xs text-gray-400">
        Classes before the start date keep their old rate. Draft invoices are updated; submitted,
        approved and paid ones are not.
      </p>
      <TabFooter
        dirty={dirty}
        isSaving={isSaving}
        onSave={() => save()}
        disabled={missingAmount || !startsFrom}
        left={
          missingAmount ? (
            <span className="text-xs text-red-600" role="alert">Enter an amount for every rate</span>
          ) : undefined
        }
      />
    </div>
  )
}

function MoneyInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix: string
}) {
  return (
    <span className="flex items-center gap-1 text-sm text-gray-500">
      <span className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-lg border border-gray-300 pl-5 pr-2 py-1 text-sm text-gray-900"
        />
      </span>
      <span className="text-xs">{suffix}</span>
    </span>
  )
}

// ─── Pay Rates Tab ────────────────────────────────────────────────────────────

function PayRatesTab({ staffId, onDirtyChange, onSaved }: { staffId: number } & TabSaveProps) {
  const queryClient = useQueryClient()

  const [rateType, setRateType] = useState<RateType>('per_class')
  const [amount, setAmount] = useState('')
  const [perHeadRate, setPerHeadRate] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [editingRateId, setEditingRateId] = useState<number | null>(null)

  const [showAddOverride, setShowAddOverride] = useState(false)
  const [overrideClassType, setOverrideClassType] = useState<number | ''>('')
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideFrom, setOverrideFrom] = useState('')

  const { data: payRates = [], isLoading: ratesLoading } = useQuery({
    queryKey: ['staff', staffId, 'pay-rates'],
    queryFn: () => listPayRates(staffId),
  })

  const { data: overrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ['staff', staffId, 'pay-rate-overrides'],
    queryFn: () => listPayRateOverrides(staffId),
  })

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const latest = [...payRates].sort(
    (a, b) => new Date(b.effective_from ?? 0).getTime() - new Date(a.effective_from ?? 0).getTime()
  )[0]

  // Unsaved if the form differs from the latest saved rate (or, with none
  // saved, has anything typed), or a class override is half filled in.
  const money = (v: unknown) => (v === '' || v == null ? 0 : Number(v))
  const rateDirty = latest
    ? rateType !== latest.rate_type ||
      money(amount) !== money(latest.amount) ||
      money(perHeadRate) !== money(latest.per_head_rate) ||
      effectiveFrom !== (latest.effective_from ?? '') ||
      effectiveTo !== (latest.effective_to ?? '')
    : amount !== '' || effectiveFrom !== ''
  const overrideDirty = showAddOverride && (overrideAmount !== '' || overrideFrom !== '')
  useReportDirty(rateDirty || overrideDirty, onDirtyChange)

  useEffect(() => {
    if (latest) {
      setEditingRateId(latest.id)
      setRateType((latest.rate_type as RateType) ?? 'per_class')
      setAmount(String(latest.amount ?? ''))
      setPerHeadRate(Number(latest.per_head_rate ?? 0) > 0 ? String(latest.per_head_rate) : '')
      setEffectiveFrom(latest.effective_from ?? '')
      setEffectiveTo(latest.effective_to ?? '')
    }
  }, [payRates])

  const { mutate: saveRate, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const payload = {
        rate_type: rateType,
        amount: rateType === 'per_head' ? '0' : amount,
        per_head_rate: ['per_head', 'blended'].includes(rateType) ? perHeadRate || '0' : '0',
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
      }
      return editingRateId
        ? updatePayRate(staffId, editingRateId, payload)
        : createPayRate(staffId, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rates'] })
      toast.success('Pay rate saved')
      onSaved()
    },
    onError: (error) => toast.error(extractApiError(error, 'Failed to save pay rate')),
  })

  const { mutate: removeRate } = useMutation({
    mutationFn: (rateId: number) => deletePayRate(staffId, rateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rates'] })
      toast.success('Pay rate removed')
      setEditingRateId(null)
      setAmount('')
      setEffectiveFrom('')
    },
    onError: () => toast.error('Failed to remove pay rate'),
  })

  const { mutate: addOverride, isPending: isAddingOverride } = useMutation({
    mutationFn: () =>
      createPayRateOverride(staffId, {
        class_type: overrideClassType === '' ? null : Number(overrideClassType),
        site: null,
        amount: overrideAmount,
        effective_from: overrideFrom,
        effective_to: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rate-overrides'] })
      toast.success('Override added')
      setShowAddOverride(false)
      setOverrideClassType('')
      setOverrideAmount('')
      setOverrideFrom('')
    },
    onError: () => toast.error('Failed to add override'),
  })

  const { mutate: removeOverride } = useMutation({
    mutationFn: (id: number) => deletePayRateOverride(staffId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rate-overrides'] })
      toast.success('Override removed')
    },
    onError: () => toast.error('Failed to remove override'),
  })

  const showPerHead = rateType === 'per_head' || rateType === 'blended'

  const amountLabel: Record<RateType, string> = {
    per_class: 'Base Rate ($)',
    per_head:  'Rate Per Head ($)',
    blended:   'Base Rate ($)',
    hourly:    'Hourly Rate ($)',
    flat:      'Flat Rate ($)',
  }

  if (ratesLoading || overridesLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading pay rates...</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Default Rate</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Rate Type">
            <select
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateType)}
              className={inputClass}
            >
              {RATE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldGroup>

          {/* Per head pay is worked out from the per-head rate alone, so the
              base box would only invite a number that gets ignored. */}
          {rateType !== 'per_head' && (
            <FieldGroup label={amountLabel[rateType]}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} pl-7`}
                />
              </div>
            </FieldGroup>
          )}

          {showPerHead && (
            <FieldGroup label="Per Head Rate ($)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={perHeadRate}
                  onChange={(e) => setPerHeadRate(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} pl-7`}
                />
              </div>
            </FieldGroup>
          )}

          <FieldGroup label="Effective From">
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={inputClass}
            />
          </FieldGroup>

          <FieldGroup label="Effective To (optional)">
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className={inputClass}
            />
          </FieldGroup>
        </div>

        {editingRateId && (
          <button
            onClick={() => removeRate(editingRateId)}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors w-fit"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove rate
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Class Overrides</p>
            <p className="text-xs text-gray-400 mt-0.5">Class-specific rate overrides</p>
          </div>
          {!showAddOverride && (
            <button
              onClick={() => setShowAddOverride(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 border border-cyan-200 px-3 py-1.5 rounded-lg hover:bg-cyan-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Override
            </button>
          )}
        </div>

        {overrides.length === 0 && !showAddOverride && (
          <p className="text-xs text-gray-400 italic py-1">No class-specific overrides set</p>
        )}

        {overrides.map((ov) => {
          const ctName = classTypes.find((c) => c.id === ov.class_type)?.name ?? 'All classes'
          return (
            <div
              key={ov.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 text-sm"
            >
              <div>
                <span className="font-medium text-gray-800">{ctName}</span>
                {ov.effective_from && (
                  <span className="text-xs text-gray-400 ml-2">from {ov.effective_from}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">
                  {ov.rate_type === 'per_head'
                    ? `$${ov.per_head_rate} per head`
                    : ov.rate_type === 'blended'
                      ? `$${ov.amount} + $${ov.per_head_rate} per head`
                      : `$${ov.amount}`}
                </span>
                <button
                  onClick={() => ov.id !== undefined && removeOverride(ov.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}

        {showAddOverride && (
          <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Class Type</label>
                <select
                  value={overrideClassType}
                  onChange={(e) =>
                    setOverrideClassType(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className={inputClass}
                >
                  <option value="">All Classes</option>
                  {classTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Effective From</label>
                <input
                  type="date"
                  value={overrideFrom}
                  onChange={(e) => setOverrideFrom(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddOverride(false)}
                className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addOverride()}
                disabled={!overrideAmount || !overrideFrom || isAddingOverride}
                className="text-xs text-white bg-gray-900 px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
              >
                {isAddingOverride ? 'Adding...' : 'Add Override'}
              </button>
            </div>
          </div>
        )}
      </div>

      <TabFooter
        dirty={rateDirty}
        isSaving={isSaving}
        onSave={() => saveRate()}
        disabled={!(rateType === 'per_head' ? perHeadRate : amount) || !effectiveFrom}
        left={
          overrideDirty ? (
            <span className="text-xs text-amber-600">Add or cancel the class override first</span>
          ) : undefined
        }
      />
    </div>
  )
}

// ─── Business & Invoice Tab ───────────────────────────────────────────────────

function BusinessTab({ staffId, onDirtyChange, onSaved }: { staffId: number } & TabSaveProps) {
  const queryClient = useQueryClient()

  const [businessName, setBusinessName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [sortCode, setSortCode] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const { data: details, isLoading } = useQuery({
    queryKey: ['staff', staffId, 'payment-details'],
    queryFn: () => getPaymentDetails(staffId),
  })

  useEffect(() => {
    if (details) {
      setBusinessName(details.business_name ?? '')
      setBankName(details.bank_name ?? '')
      setAccountName(details.account_name ?? '')
      setAccountNumber(details.account_number ?? '')
      setSortCode(details.sort_code ?? '')
      setPaymentReference(details.payment_reference ?? '')
      setAdditionalNotes(details.additional_notes ?? '')
    }
  }, [details])

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      createOrUpdatePaymentDetails(
        staffId,
        {
          business_name: businessName,
          bank_name: bankName,
          account_name: accountName,
          account_number: accountNumber,
          sort_code: sortCode,
          payment_reference: paymentReference,
          additional_notes: additionalNotes,
        },
        logoFile,
      ),
    onSuccess: (saved) => {
      // Cache what was stored, so the form compares against it straight away.
      queryClient.setQueryData(['staff', staffId, 'payment-details'], saved)
      setLogoFile(null)
      toast.success('Payment details saved')
      onSaved()
    },
    onError: (error) => toast.error(extractApiError(error, 'Failed to save payment details')),
  })

  const dirty =
    logoFile !== null ||
    businessName !== (details?.business_name ?? '') ||
    bankName !== (details?.bank_name ?? '') ||
    accountName !== (details?.account_name ?? '') ||
    accountNumber !== (details?.account_number ?? '') ||
    sortCode !== (details?.sort_code ?? '') ||
    paymentReference !== (details?.payment_reference ?? '') ||
    additionalNotes !== (details?.additional_notes ?? '')
  useReportDirty(dirty, onDirtyChange)

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Business Identity</p>
          <p className="text-xs text-gray-400 mt-0.5">Appears on generated invoices. Leave blank to use full name.</p>
        </div>

        <FieldGroup label="Company / Trading Name">
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Jane Smith Fitness Ltd"
            className={inputClass}
          />
        </FieldGroup>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
            Business Logo <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 cursor-pointer hover:bg-gray-50 transition-colors">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {logoFile ? logoFile.name : 'Upload Logo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {logoFile && (
            <button
              onClick={() => setLogoFile(null)}
              className="ml-2 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          )}
          {!logoFile && details?.business_logo && (
            <img
              src={details.business_logo}
              alt="Current business logo"
              className="mt-3 h-12 w-auto rounded border border-gray-100"
            />
          )}
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Payment Details</p>
          <p className="text-xs text-gray-400 mt-0.5">Bank details shown on invoices so payment can be made.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Bank Name">
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Barclays"
              className={inputClass}
            />
          </FieldGroup>

          <FieldGroup label="Account Name">
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className={inputClass}
            />
          </FieldGroup>

          <FieldGroup label="Account Number">
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 12345678"
              className={inputClass}
            />
          </FieldGroup>

          <FieldGroup label="Sort Code">
            <input
              type="text"
              value={sortCode}
              onChange={(e) => setSortCode(e.target.value)}
              placeholder="e.g. 20-00-00"
              className={inputClass}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Payment Reference">
          <input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="e.g. Invoice number"
            className={inputClass}
          />
        </FieldGroup>

        <FieldGroup label="Additional Notes">
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Any other payment instructions..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </FieldGroup>
      </div>

      <TabFooter dirty={dirty} isSaving={isSaving} onSave={() => save()} />
    </div>
  )
}

// ─── Staff Detail Modal ───────────────────────────────────────────────────────

interface StaffDetailModalProps {
  staffId: number | null
  onClose: () => void
}

export function StaffDetailModal({ staffId, onClose }: StaffDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  // Whether the open tab has edits that haven't been saved.
  const [dirty, setDirty] = useState(false)
  // A tab switch or close waiting on "discard unsaved changes?".
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', staffId],
    queryFn: () => getStaff(staffId!),
    enabled: staffId !== null,
  })

  // Reset to info tab when a different staff member is opened
  useEffect(() => {
    setActiveTab('info')
    setDirty(false)
    setPendingLeave(null)
  }, [staffId])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleDirtyChange = React.useCallback((value: boolean) => setDirty(value), [])
  const handleSaved = React.useCallback(() => setJustSaved(true), [])

  /** Run `leave` now, or once the user agrees to drop unsaved edits. */
  function guard(leave: () => void) {
    if (dirty) setPendingLeave(() => leave)
    else leave()
  }

  function switchTab(tab: TabId) {
    if (tab !== activeTab) guard(() => setActiveTab(tab))
  }

  const close = () => guard(onClose)

  // Lock body scroll while open
  useEffect(() => {
    if (staffId !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [staffId])

  if (staffId === null) return null

  const tabs: { id: TabId; label: string }[] = [
    { id: 'info',         label: 'Info' },
    { id: 'availability', label: 'Availability' },
    { id: 'classes',      label: 'Classes' },
    { id: 'pay-rates',    label: 'Pay Rates' },
    { id: 'business',     label: 'Business & Invoice' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-6 pb-4 border-b border-gray-100">
          {staff ? (
            <>
              {/* Avatar */}
              <div className="h-14 w-14 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
                <span className="text-white text-xl font-bold">
                  {(staff.first_name || staff.name || '?').charAt(0)}{(staff.last_name || '').charAt(0)}
                </span>
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">
                  {staff.name || `${staff.first_name} ${staff.last_name}`.trim()}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="grey">{ROLE_LABELS[staff.role] ?? staff.role}</Badge>
                  <Badge variant={staff.status === 'active' ? 'green' : 'grey'} dot>
                    {staff.status === 'active' ? 'Active' : staff.status ?? 'Inactive'}
                  </Badge>
                </div>
              </div>

              {/* Reliability score */}
              <div className="flex items-center gap-1 shrink-0">
                <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                <span className="text-sm font-semibold text-gray-700">
                  {parseFloat(String(staff.reliability_score ?? 0)).toFixed(0)}%
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 h-14 bg-gray-100 animate-pulse rounded-lg" />
          )}

          {/* Close button */}
          <button
            onClick={close}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-shrink-0 border-b border-gray-100 px-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={[
                'px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
          {justSaved && (
            <span className="ml-auto self-center pl-3 text-xs font-medium text-green-600 whitespace-nowrap" role="status">
              ✓ Saved
            </span>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading || !staff ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'info' && (
                // Keyed on the record's version: the form copies the values
                // into state once, so fresh data has to remount it.
                <InfoTab
                  key={`${staff.id}-${staff.updated_at ?? ''}`}
                  staff={staff}
                  onSaved={handleSaved}
                  onDirtyChange={handleDirtyChange}
                  onDeleted={onClose}
                />
              )}
              {activeTab === 'availability' && (
                <AvailabilityTab staffId={staff.id} onSaved={handleSaved} onDirtyChange={handleDirtyChange} />
              )}
              {activeTab === 'classes' && (
                <ClassesTab staffId={staff.id} onSaved={handleSaved} onDirtyChange={handleDirtyChange} />
              )}
              {activeTab === 'pay-rates' && (
                <PayRatesTab staffId={staff.id} onSaved={handleSaved} onDirtyChange={handleDirtyChange} />
              )}
              {activeTab === 'business' && (
                <BusinessTab staffId={staff.id} onSaved={handleSaved} onDirtyChange={handleDirtyChange} />
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingLeave !== null}
        onClose={() => setPendingLeave(null)}
        onConfirm={() => {
          const leave = pendingLeave
          setPendingLeave(null)
          setDirty(false)
          leave?.()
        }}
        title="Discard unsaved changes?"
        message={`You have changes on the ${tabs.find((t) => t.id === activeTab)?.label ?? 'current'} tab that haven't been saved. Leave without saving them?`}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </div>
  )
}
