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
  listAvailability,
  createAvailability,
  deleteAvailability,
  getPaymentDetails,
  createOrUpdatePaymentDetails,
} from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { StaffMember, UserRole } from '../../types'

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
  { value: '',  label: 'No Preference' },
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const TIME_SLOTS = [
  { key: 'morning',   label: 'Morning',   start: '06:00:00', end: '12:00:00' },
  { key: 'lunch',     label: 'Lunch',     start: '12:00:00', end: '14:00:00' },
  { key: 'afternoon', label: 'Afternoon', start: '14:00:00', end: '17:00:00' },
  { key: 'evening',   label: 'Evening',   start: '17:00:00', end: '22:00:00' },
] as const

const WEEK_DAYS_ORDERED = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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
  children: React.ReactNode
}

function FieldGroup({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-cyan-400 w-full'

// ─── Info Tab ─────────────────────────────────────────────────────────────────

interface InfoTabProps {
  staff: StaffMember
  onSaved: () => void
  onDeleted: () => void
}

function InfoTab({ staff, onSaved, onDeleted }: InfoTabProps) {
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [email, setEmail] = useState(staff.email)
  const [phone, setPhone] = useState(staff.phone ?? '')
  const [role, setRole] = useState<UserRole>(staff.role)
  const [isActive, setIsActive] = useState(staff.status === 'active')
  const [priorityTier, setPriorityTier] = useState('')

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      updateStaff(staff.id, {
        email,
        phone: phone || undefined,
        role,
        is_active: isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member updated')
      onSaved()
    },
    onError: () => toast.error('Failed to update staff member'),
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

  const { mutate: addQual } = useMutation({
    mutationFn: () =>
      createQualification(staff.id, {
        name: qualName,
        issued_date: issuedDate,
        expiry_date: expiryDate || null,
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

  const statusValue = isActive ? 'active' : 'inactive'

  function handleStatusChange(value: string) {
    setIsActive(value === 'active')
  }

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

        <FieldGroup label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className={inputClass}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Status">
          <select
            value={statusValue}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={inputClass}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FieldGroup>
      </div>

      {/* Priority Tier — full width */}
      <FieldGroup label="Priority Tier">
        <select
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

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 text-sm text-red-500 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
        <div className="flex gap-2">
          <button
            onClick={onSaved}
            className="text-sm text-gray-600 border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <Button onClick={() => save()} isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </div>

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

function AvailabilityTab({ staffId }: { staffId: number }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Set<string>>(new Set())

  const { data: availability = [], isLoading } = useQuery({
    queryKey: ['staff', staffId, 'availability'],
    queryFn: () => listAvailability(staffId),
  })

  const slotMap = new Map<string, number>()
  for (const slot of availability) {
    const matched = TIME_SLOTS.find(
      (s) =>
        slot.start_time === s.start ||
        slot.start_time.startsWith(s.start.substring(0, 5))
    )
    if (matched) {
      slotMap.set(`${slot.day_of_week}-${matched.key}`, slot.id)
    }
  }

  async function toggleSlot(dayIndex: number, slotDef: typeof TIME_SLOTS[number]) {
    const cellKey = `${dayIndex}-${slotDef.key}`
    const existingId = slotMap.get(cellKey)
    setPending((prev) => new Set([...prev, cellKey]))
    try {
      if (existingId !== undefined) {
        await deleteAvailability(staffId, existingId)
      } else {
        await createAvailability(staffId, {
          day_of_week: dayIndex,
          start_time: slotDef.start,
          end_time: slotDef.end,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'availability'] })
    } catch {
      toast.error('Failed to update availability')
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(cellKey)
        return next
      })
    }
  }

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
              {TIME_SLOTS.map((slot) => (
                <th key={slot.key} className="pb-3 text-center text-xs font-semibold text-gray-600">
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK_DAYS_ORDERED.map((dayName, dayIndex) => (
              <tr key={dayName} className="border-t border-gray-50">
                <td className="py-3 text-sm text-gray-700 font-medium">{dayName}</td>
                {TIME_SLOTS.map((slotDef) => {
                  const cellKey = `${dayIndex}-${slotDef.key}`
                  const isChecked = slotMap.has(cellKey)
                  const isPendingCell = pending.has(cellKey)
                  return (
                    <td key={slotDef.key} className="py-3 text-center">
                      <div className="flex items-center justify-center">
                        {isPendingCell ? (
                          <span className="h-4 w-4 rounded border-2 border-cyan-400 border-t-transparent animate-spin inline-block" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSlot(dayIndex, slotDef)}
                            className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                          />
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 pt-2 border-t border-gray-50">
        Changes save immediately. Checked slots indicate preferred availability for cover requests.
      </p>
    </div>
  )
}

// ─── Classes Tab ──────────────────────────────────────────────────────────────

/** Pull a human-readable message out of a DRF error response, falling back to
 *  a generic label. Without this, the user only ever sees "Failed to ...". */
export function extractApiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data
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

export function ClassesTab({ staffId }: { staffId: number }) {
  const queryClient = useQueryClient()

  const { data: capabilities = [], isLoading: capsLoading } = useQuery({
    queryKey: ['staff', staffId, 'capabilities'],
    queryFn: () => listCapabilities(staffId),
  })

  const { data: classTypes = [], isLoading: ctLoading } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { mutate: addCap } = useMutation({
    mutationFn: (classTypeId: number) => createCapability(staffId, { class_type: classTypeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Class type added')
    },
    onError: (error) => toast.error(extractApiError(error, 'Failed to add class type')),
  })

  const { mutate: removeCap } = useMutation({
    mutationFn: (capId: number) => deleteCapability(staffId, capId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Class type removed')
    },
    onError: (error) => toast.error(extractApiError(error, 'Failed to remove class type')),
  })

  if (capsLoading || ctLoading) {
    return <p className="text-sm text-gray-400 py-6 text-center">Loading...</p>
  }

  const enabledIds = new Set(capabilities.map((c) => c.class_type))
  const capabilityByClassType = new Map(capabilities.map((c) => [c.class_type, c.id]))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-500 mb-2">
        Toggle the class types this instructor is qualified to teach.
      </p>
      {classTypes.map((ct) => {
        const isEnabled = enabledIds.has(ct.id)
        return (
          <label
            key={ct.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  addCap(ct.id)
                } else {
                  const capId = capabilityByClassType.get(ct.id)
                  if (capId !== undefined) removeCap(capId)
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
            />
            <span className="text-sm text-gray-800">{ct.name}</span>
          </label>
        )
      })}
    </div>
  )
}

// ─── Pay Rates Tab ────────────────────────────────────────────────────────────

function PayRatesTab({ staffId }: { staffId: number }) {
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

  useEffect(() => {
    const sorted = [...payRates].sort(
      (a, b) =>
        new Date(b.effective_from ?? 0).getTime() - new Date(a.effective_from ?? 0).getTime()
    )
    const latest = sorted[0]
    if (latest) {
      setEditingRateId(latest.id)
      setRateType((latest.rate_type as RateType) ?? 'per_class')
      setAmount(String(latest.amount ?? ''))
      setPerHeadRate('')
      setEffectiveFrom(latest.effective_from ?? '')
      setEffectiveTo(latest.effective_to ?? '')
    }
  }, [payRates])

  const { mutate: saveRate, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const payload = {
        rate_type: rateType,
        amount,
        per_head_rate: ['per_head', 'blended'].includes(rateType) ? perHeadRate : '0',
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
      }
      return editingRateId
        ? updatePayRate(staffId, editingRateId, payload)
        : createPayRate(staffId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rates'] })
      toast.success('Pay rate saved')
    },
    onError: () => toast.error('Failed to save pay rate'),
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

        <div className="flex items-center justify-between pt-1">
          {editingRateId ? (
            <button
              onClick={() => removeRate(editingRateId)}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove rate
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => saveRate()}
            disabled={!amount || !effectiveFrom || isSaving}
            className="text-xs font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : editingRateId ? 'Update Rate' : 'Save Rate'}
          </button>
        </div>
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
                <span className="font-semibold text-gray-900">${ov.amount}</span>
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
    </div>
  )
}

// ─── Business & Invoice Tab ───────────────────────────────────────────────────

function BusinessTab({ staffId }: { staffId: number }) {
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
      createOrUpdatePaymentDetails(staffId, {
        business_name: businessName,
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        sort_code: sortCode,
        payment_reference: paymentReference,
        additional_notes: additionalNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'payment-details'] })
      toast.success('Payment details saved')
    },
    onError: () => toast.error('Failed to save payment details'),
  })

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

      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <span />
        <Button onClick={() => save()} isLoading={isSaving}>
          Save Changes
        </Button>
      </div>
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

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', staffId],
    queryFn: () => getStaff(staffId!),
    enabled: staffId !== null,
  })

  // Reset to info tab when a different staff member is opened
  useEffect(() => {
    setActiveTab('info')
  }, [staffId])

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
        onClick={onClose}
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
            onClick={onClose}
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
              onClick={() => setActiveTab(tab.id)}
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
                <InfoTab staff={staff} onSaved={onClose} onDeleted={onClose} />
              )}
              {activeTab === 'availability' && <AvailabilityTab staffId={staff.id} />}
              {activeTab === 'classes' && <ClassesTab staffId={staff.id} />}
              {activeTab === 'pay-rates' && <PayRatesTab staffId={staff.id} />}
              {activeTab === 'business' && <BusinessTab staffId={staff.id} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
