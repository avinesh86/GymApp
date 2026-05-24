import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { User, Mail, Phone } from 'lucide-react'
import {
  getMyStaffProfile,
  updateStaff,
  listAvailability,
  createAvailability,
  deleteAvailability,
  listCapabilities,
  createCapability,
  deleteCapability,
  getPaymentDetails,
  createOrUpdatePaymentDetails,
  type PaymentDetails,
} from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import type { Availability, Capability } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileTab = 'info' | 'availability' | 'classes' | 'payment'

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'info',         label: 'Info' },
  { key: 'availability', label: 'Availability' },
  { key: 'classes',      label: 'Classes' },
  { key: 'payment',      label: 'Payment Details' },
]

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', gym_manager: 'Gym Manager',
  payroll: 'Payroll', team_leader: 'Team Leader',
  instructor: 'Instructor', class_count_admin: 'Class Count Admin',
}

// Day of week: 0=Mon … 6=Sun (matches the Availability.day_of_week field,
// assuming the API uses 0=Monday like date-fns weekStartsOn:1).
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const TIME_BANDS: { label: string; startHour: number; endHour: number }[] = [
  { label: 'Morning',   startHour: 5,  endHour: 12 },
  { label: 'Lunch',     startHour: 12, endHour: 14 },
  { label: 'Afternoon', startHour: 14, endHour: 18 },
  { label: 'Evening',   startHour: 18, endHour: 24 },
]

type AvailabilityGrid = boolean[][]  // [dayIndex][bandIndex]

function buildGridFromSlots(slots: Availability[]): AvailabilityGrid {
  const grid: AvailabilityGrid = Array.from({ length: 7 }, () =>
    Array(TIME_BANDS.length).fill(false)
  )

  for (const slot of slots) {
    const startHour = parseInt(slot.start_time.split(':')[0], 10)
    const dayIndex = slot.day_of_week

    TIME_BANDS.forEach((band, bandIndex) => {
      if (startHour >= band.startHour && startHour < band.endHour) {
        if (dayIndex >= 0 && dayIndex < 7) {
          grid[dayIndex][bandIndex] = true
        }
      }
    })
  }

  return grid
}

function zeroPad(n: number): string {
  return String(n).padStart(2, '0')
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────

interface InfoTabProps {
  staffId: number
}

function InfoTab({ staffId }: InfoTabProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', staffId],
    queryFn: () => getMyStaffProfile(),
  })

  useEffect(() => {
    if (staff) setPhone(staff.phone ?? '')
  }, [staff])

  const { mutate: savePhone, isPending } = useMutation({
    mutationFn: () => updateStaff(staffId, { phone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId] })
      queryClient.invalidateQueries({ queryKey: ['staff', 'me'] })
      toast.success('Profile updated')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  if (isLoading) return <PageSpinner />
  if (!staff) return null

  const fullName = staff.name || `${staff.first_name} ${staff.last_name}`.trim()
  const initials = `${(staff.first_name || fullName || '?').charAt(0)}${(staff.last_name || '').charAt(0)}`.toUpperCase()

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
          <span className="text-white text-xl font-bold">{initials}</span>
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-lg">{fullName}</p>
          <Badge variant="blue">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</Badge>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
              <Mail className="h-4 w-4" /> Email
            </label>
            <p className="text-sm text-gray-900">{staff.email}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
              <User className="h-4 w-4" /> Name
            </label>
            <p className="text-sm text-gray-900">{fullName}</p>
          </div>

          <div className="flex flex-col gap-1">
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 000000"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => savePhone()} isLoading={isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Availability Tab ─────────────────────────────────────────────────────────

interface AvailabilityTabProps {
  staffId: number
}

function AvailabilityTab({ staffId }: AvailabilityTabProps) {
  const queryClient = useQueryClient()
  const [grid, setGrid] = useState<AvailabilityGrid>(() =>
    Array.from({ length: 7 }, () => Array(TIME_BANDS.length).fill(false))
  )
  const [isSaving, setIsSaving] = useState(false)

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['staff', staffId, 'availability'],
    queryFn: () => listAvailability(staffId),
  })

  // Sync remote slots into local grid when data loads
  useEffect(() => {
    setGrid(buildGridFromSlots(slots))
  }, [slots])

  function toggleCell(dayIndex: number, bandIndex: number) {
    setGrid((prev) => {
      const next = prev.map((row) => [...row])
      next[dayIndex][bandIndex] = !next[dayIndex][bandIndex]
      return next
    })
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      // Delete all existing slots
      await Promise.all(slots.map((slot) => deleteAvailability(staffId, slot.id)))

      // Create new slots for every checked cell
      const creates: Promise<Availability>[] = []
      grid.forEach((dayRow, dayIndex) => {
        dayRow.forEach((checked, bandIndex) => {
          if (checked) {
            const band = TIME_BANDS[bandIndex]
            creates.push(
              createAvailability(staffId, {
                day_of_week: dayIndex,
                start_time: `${zeroPad(band.startHour)}:00:00`,
                end_time: `${zeroPad(band.endHour)}:00:00`,
              })
            )
          }
        })
      })

      await Promise.all(creates)
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'availability'] })
      toast.success('Availability saved')
    } catch {
      toast.error('Failed to save availability')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Select the time bands when you are available to teach.
      </p>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="pr-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-28" />
              {TIME_BANDS.map((band) => (
                <th key={band.label} className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-center whitespace-nowrap">
                  {band.label}
                  <span className="block font-normal text-gray-400 normal-case tracking-normal">
                    {zeroPad(band.startHour)}–{zeroPad(band.endHour)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {DAYS_OF_WEEK.map((day, dayIndex) => (
              <tr key={day}>
                <td className="pr-4 py-2 font-medium text-gray-700">{day}</td>
                {TIME_BANDS.map((_, bandIndex) => {
                  const isChecked = grid[dayIndex]?.[bandIndex] ?? false
                  return (
                    <td key={bandIndex} className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleCell(dayIndex, bandIndex)}
                        aria-label={`Toggle ${day} ${TIME_BANDS[bandIndex].label}`}
                        className={[
                          'h-9 w-16 rounded-lg border-2 transition-colors font-medium text-xs',
                          isChecked
                            ? 'bg-cyan-500 border-cyan-500 text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-cyan-300',
                        ].join(' ')}
                      >
                        {isChecked ? 'Available' : '—'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={isSaving}>
          Save Availability
        </Button>
      </div>
    </div>
  )
}

// ─── Classes Tab ──────────────────────────────────────────────────────────────

interface ClassesTabProps {
  staffId: number
}

function ClassesTab({ staffId }: ClassesTabProps) {
  const queryClient = useQueryClient()

  const { data: allClassTypes = [], isLoading: isLoadingTypes } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { data: capabilities = [], isLoading: isLoadingCaps } = useQuery({
    queryKey: ['staff', staffId, 'capabilities'],
    queryFn: () => listCapabilities(staffId),
  })

  const capabilityMap = new Map<number, Capability>(
    capabilities.map((cap) => [cap.class_type, cap])
  )

  const { mutate: addCapability } = useMutation({
    mutationFn: (classTypeId: number) => createCapability(staffId, { class_type: classTypeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Class capability added')
    },
    onError: () => toast.error('Failed to add capability'),
  })

  const { mutate: removeCapability } = useMutation({
    mutationFn: (capId: number) => deleteCapability(staffId, capId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Class capability removed')
    },
    onError: () => toast.error('Failed to remove capability'),
  })

  if (isLoadingTypes || isLoadingCaps) return <PageSpinner />

  function toggleCapability(classTypeId: number) {
    const existing = capabilityMap.get(classTypeId)
    if (existing) {
      removeCapability(existing.id)
    } else {
      addCapability(classTypeId)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Toggle the class types you are qualified to teach. Highlighted chips indicate active capabilities.
      </p>
      {allClassTypes.length === 0 ? (
        <p className="text-sm text-gray-400">No class types configured for this gym yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allClassTypes.map((classType) => {
            const isActive = capabilityMap.has(classType.id)
            return (
              <button
                key={classType.id}
                onClick={() => toggleCapability(classType.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border-2 transition-colors',
                  isActive
                    ? 'bg-cyan-500 border-cyan-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-cyan-300',
                ].join(' ')}
              >
                {classType.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Payment Details Tab ──────────────────────────────────────────────────────

interface PaymentTabProps {
  staffId: number
}

const EMPTY_PAYMENT: PaymentDetails = {
  business_name: '',
  bank_name: '',
  account_name: '',
  account_number: '',
  sort_code: '',
  payment_reference: '',
  additional_notes: '',
}

function PaymentTab({ staffId }: PaymentTabProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PaymentDetails>(EMPTY_PAYMENT)

  const { data: paymentData, isLoading } = useQuery({
    queryKey: ['staff', staffId, 'payment-details'],
    queryFn: () => getPaymentDetails(staffId),
    retry: false, // 404 means no record yet — that's fine
  })

  useEffect(() => {
    if (paymentData) setForm(paymentData)
  }, [paymentData])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => createOrUpdatePaymentDetails(staffId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'payment-details'] })
      toast.success('Payment details saved')
    },
    onError: () => toast.error('Failed to save payment details'),
  })

  function setField(field: keyof PaymentDetails, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <p className="text-sm text-gray-500">
        These details are used to process your payments. Keep them up to date.
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <Input
            label="Business Name"
            value={form.business_name}
            onChange={(e) => setField('business_name', e.target.value)}
            placeholder="Your business or trading name"
          />
          <Input
            label="Bank Name"
            value={form.bank_name}
            onChange={(e) => setField('bank_name', e.target.value)}
            placeholder="e.g. Lloyds Bank"
          />
          <Input
            label="Account Name"
            value={form.account_name}
            onChange={(e) => setField('account_name', e.target.value)}
            placeholder="Name on the account"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Number"
              value={form.account_number}
              onChange={(e) => setField('account_number', e.target.value)}
              placeholder="12345678"
            />
            <Input
              label="Sort Code"
              value={form.sort_code}
              onChange={(e) => setField('sort_code', e.target.value)}
              placeholder="00-00-00"
            />
          </div>
          <Input
            label="Payment Reference"
            value={form.payment_reference}
            onChange={(e) => setField('payment_reference', e.target.value)}
            placeholder="Reference that will appear on your bank statement"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Additional Notes</label>
            <textarea
              value={form.additional_notes}
              onChange={(e) => setField('additional_notes', e.target.value)}
              rows={3}
              placeholder="Any additional payment instructions..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save()} isLoading={isPending}>
              Save Payment Details
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>('info')

  const { data: staffProfile, isLoading } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: getMyStaffProfile,
    enabled: !!user,
  })

  if (isLoading) return <PageSpinner />

  if (!staffProfile) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <p className="text-sm text-gray-500">
          No staff profile found for your account. Please contact an administrator.
        </p>
      </div>
    )
  }

  const staffId = staffProfile.id

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="My Profile"
        subtitle={staffProfile.name || `${staffProfile.first_name} ${staffProfile.last_name}`.trim()}
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'info'         && <InfoTab staffId={staffId} />}
      {activeTab === 'availability' && <AvailabilityTab staffId={staffId} />}
      {activeTab === 'classes'      && <ClassesTab staffId={staffId} />}
      {activeTab === 'payment'      && <PaymentTab staffId={staffId} />}
    </div>
  )
}
