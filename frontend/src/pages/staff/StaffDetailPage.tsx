import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Mail,
  Phone,
  Star,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  getStaff,
  listPayRates,
  listQualifications,
  listCapabilities,
  listAvailability,
  deletePayRate,
  deleteQualification,
  deleteCapability,
  createPayRate,
  createQualification,
  createCapability,
  createAvailability,
  deleteAvailability,
} from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageSpinner } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { format } from 'date-fns'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', gym_manager: 'Gym Manager',
  payroll: 'Payroll', team_leader: 'Team Leader',
  instructor: 'Instructor', class_count_admin: 'Class Count Admin',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ─── Availability time-band grid ──────────────────────────────────────────────

const WEEK_DAYS = [
  { label: 'Monday',    dayOfWeek: 1 },
  { label: 'Tuesday',   dayOfWeek: 2 },
  { label: 'Wednesday', dayOfWeek: 3 },
  { label: 'Thursday',  dayOfWeek: 4 },
  { label: 'Friday',    dayOfWeek: 5 },
  { label: 'Saturday',  dayOfWeek: 6 },
  { label: 'Sunday',    dayOfWeek: 0 },
]

type TimeBand = 'morning' | 'lunch' | 'afternoon' | 'evening'

const TIME_BANDS: { key: TimeBand; label: string; startTime: string; endTime: string }[] = [
  { key: 'morning',   label: 'Morning',   startTime: '05:00:00', endTime: '12:00:00' },
  { key: 'lunch',     label: 'Lunch',     startTime: '12:00:00', endTime: '14:00:00' },
  { key: 'afternoon', label: 'Afternoon', startTime: '14:00:00', endTime: '18:00:00' },
  { key: 'evening',   label: 'Evening',   startTime: '18:00:00', endTime: '23:59:00' },
]

/** Returns the time-band key for a given start_time string (HH:MM or HH:MM:SS). */
function getBandForStartTime(startTime: string): TimeBand | null {
  const hours = parseInt(startTime.split(':')[0], 10)
  if (hours >= 5  && hours < 12) return 'morning'
  if (hours >= 12 && hours < 14) return 'lunch'
  if (hours >= 14 && hours < 18) return 'afternoon'
  if (hours >= 18)               return 'evening'
  return null
}

/** Serialise a day+band pair to the Set key format. */
function toCellKey(dayOfWeek: number, band: TimeBand): string {
  return `${dayOfWeek}-${band}`
}

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const staffId = Number(id)

  const [showAddRate, setShowAddRate] = useState(false)
  const [showAddQual, setShowAddQual] = useState(false)
  const [showAddCap, setShowAddCap] = useState(false)

  // Pay rate form state
  const [ratePerHour, setRatePerHour] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  // Qualification form state
  const [qualName, setQualName] = useState('')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  // Capability form state
  const [capClassType, setCapClassType] = useState('')

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', staffId],
    queryFn: () => getStaff(staffId),
  })

  const { data: payRates = [] } = useQuery({
    queryKey: ['staff', staffId, 'pay-rates'],
    queryFn: () => listPayRates(staffId),
  })

  const { data: qualifications = [] } = useQuery({
    queryKey: ['staff', staffId, 'qualifications'],
    queryFn: () => listQualifications(staffId),
  })

  const { data: capabilities = [] } = useQuery({
    queryKey: ['staff', staffId, 'capabilities'],
    queryFn: () => listCapabilities(staffId),
  })

  const { data: availability = [] } = useQuery({
    queryKey: ['staff', staffId, 'availability'],
    queryFn: () => listAvailability(staffId),
  })

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { mutate: addRate } = useMutation({
    mutationFn: () => createPayRate(staffId, { rate_per_hour: ratePerHour, effective_from: effectiveFrom }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rates'] })
      toast.success('Pay rate added')
      setShowAddRate(false)
      setRatePerHour('')
      setEffectiveFrom('')
    },
    onError: () => toast.error('Failed to add pay rate'),
  })

  const { mutate: removeRate } = useMutation({
    mutationFn: (rateId: number) => deletePayRate(staffId, rateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'pay-rates'] })
      toast.success('Pay rate removed')
    },
  })

  const { mutate: addQual } = useMutation({
    mutationFn: () => createQualification(staffId, {
      name: qualName,
      issued_date: issuedDate,
      expiry_date: expiryDate || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'qualifications'] })
      toast.success('Qualification added')
      setShowAddQual(false)
      setQualName('')
      setIssuedDate('')
      setExpiryDate('')
    },
    onError: () => toast.error('Failed to add qualification'),
  })

  const { mutate: removeQual } = useMutation({
    mutationFn: (qualId: number) => deleteQualification(staffId, qualId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'qualifications'] })
      toast.success('Qualification removed')
    },
  })

  const { mutate: addCap } = useMutation({
    mutationFn: () => createCapability(staffId, { class_type: Number(capClassType) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Capability added')
      setShowAddCap(false)
      setCapClassType('')
    },
    onError: () => toast.error('Failed to add capability'),
  })

  const { mutate: removeCap } = useMutation({
    mutationFn: (capId: number) => deleteCapability(staffId, capId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'capabilities'] })
      toast.success('Capability removed')
    },
  })

  // ─── Availability grid state ───────────────────────────────────────────────

  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [isSavingAvailability, setIsSavingAvailability] = useState(false)

  // Sync grid when availability data loads / changes
  useEffect(() => {
    const active = new Set<string>()
    for (const slot of availability) {
      const band = getBandForStartTime(slot.start_time)
      if (band !== null) {
        active.add(toCellKey(slot.day_of_week, band))
      }
    }
    setSelectedCells(active)
  }, [availability])

  function toggleCell(dayOfWeek: number, band: TimeBand) {
    setSelectedCells((prev) => {
      const next = new Set(prev)
      const key = toCellKey(dayOfWeek, band)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  async function saveAvailability() {
    setIsSavingAvailability(true)
    try {
      // Delete all existing slots
      await Promise.all(availability.map((slot) => deleteAvailability(staffId, slot.id)))

      // Create new slots for each selected cell
      const creates = Array.from(selectedCells).map((cellKey) => {
        const [dayStr, band] = cellKey.split('-') as [string, TimeBand]
        const dayOfWeek = parseInt(dayStr, 10)
        const bandConfig = TIME_BANDS.find((b) => b.key === band)!
        return createAvailability(staffId, {
          day_of_week: dayOfWeek,
          start_time: bandConfig.startTime,
          end_time: bandConfig.endTime,
          is_available: true,
        })
      })
      await Promise.all(creates)

      queryClient.invalidateQueries({ queryKey: ['staff', staffId, 'availability'] })
      toast.success('Availability saved')
    } catch {
      toast.error('Failed to save availability')
    } finally {
      setIsSavingAvailability(false)
    }
  }

  if (isLoading) return <PageSpinner />
  if (!staff) return <p className="text-gray-500">Staff member not found</p>

  const initials = `${(staff.first_name || staff.name || '?').charAt(0)}${(staff.last_name || '').charAt(0)}`.toUpperCase()

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/staff')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Staff
      </button>

      {/* Profile header */}
      <Card className="mb-4">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xl font-bold">{initials}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  {staff.name || `${staff.first_name} ${staff.last_name}`.trim()}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={staff.status === 'active' ? 'green' : 'grey'} dot>
                    {staff.status === 'active' ? 'Active' : staff.status ?? 'Inactive'}
                  </Badge>
                  <Badge variant="blue">{ROLE_LABELS[staff.role] ?? staff.role}</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-gray-400" />
                {staff.email}
              </span>
              {staff.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {staff.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                {parseFloat(String(staff.reliability_score ?? 0)).toFixed(0)}% reliability
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Pay rates */}
      <Card className="mb-4" padding={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Pay Rates</h2>
          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowAddRate(true)}>
            Add Rate
          </Button>
        </div>
        {payRates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pay rates configured</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rate/hr</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Effective From</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Class Type</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {payRates.map((rate) => (
                <tr key={rate.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">${rate.rate_per_hour ?? rate.amount}</td>
                  <td className="px-4 py-2 text-gray-600">{rate.effective_from ? format(new Date(rate.effective_from), 'd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-2 text-gray-600">All classes</td>
                  <td className="px-4 py-2">
                    <button onClick={() => removeRate(rate.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Capabilities */}
      <Card className="mb-4" padding={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Class Capabilities</h2>
          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowAddCap(true)}>
            Add
          </Button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {capabilities.length === 0 ? (
            <p className="text-sm text-gray-400">No capabilities configured</p>
          ) : (
            capabilities.map((cap) => (
              <span key={cap.id} className="inline-flex items-center gap-1.5 bg-cyan-50 text-cyan-700 rounded-full px-3 py-1 text-sm font-medium">
                {cap.class_type_name}
                <button onClick={() => removeCap(cap.id)} className="text-cyan-400 hover:text-cyan-700">
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </Card>

      {/* Qualifications */}
      <Card className="mb-4" padding={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Qualifications</h2>
          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowAddQual(true)}>
            Add
          </Button>
        </div>
        {qualifications.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No qualifications recorded</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {qualifications.map((qual) => (
              <li key={qual.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{qual.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(qual.issued_at || qual.issued_date) ? `Issued ${format(new Date(qual.issued_at ?? qual.issued_date!), 'd MMM yyyy')}` : ''}
                    {(qual.expires_at || qual.expiry_date) && ` · Expires ${format(new Date(qual.expires_at ?? qual.expiry_date!), 'd MMM yyyy')}`}
                  </p>
                </div>
                <button onClick={() => removeQual(qual.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Availability */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Availability</h2>
        </div>

        <div className="px-4 py-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {/* Empty corner */}
                <th className="w-24 py-2 pr-3 text-left text-gray-400 font-medium" />
                {TIME_BANDS.map((band) => (
                  <th key={band.key} className="py-2 px-2 text-center text-gray-500 font-medium whitespace-nowrap">
                    <div>{band.label}</div>
                    <div className="text-gray-400 font-normal">
                      {band.startTime.slice(0, 5)}–{band.endTime.slice(0, 5)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEK_DAYS.map(({ label, dayOfWeek }) => (
                <tr key={dayOfWeek} className="border-t border-gray-50">
                  <td className="py-2 pr-3 text-gray-700 font-medium whitespace-nowrap">{label}</td>
                  {TIME_BANDS.map((band) => {
                    const cellKey = toCellKey(dayOfWeek, band.key)
                    const isActive = selectedCells.has(cellKey)
                    return (
                      <td key={band.key} className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleCell(dayOfWeek, band.key)}
                          className={[
                            'w-full h-8 rounded-md border transition-colors text-xs font-medium',
                            isActive
                              ? 'bg-cyan-500 border-cyan-500 text-white'
                              : 'bg-white border-gray-300 text-gray-400 hover:border-cyan-400',
                          ].join(' ')}
                          aria-pressed={isActive}
                          aria-label={`${label} ${band.label}`}
                        >
                          {isActive ? 'On' : 'Off'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <Button
            onClick={saveAvailability}
            disabled={isSavingAvailability}
          >
            {isSavingAvailability ? 'Saving…' : 'Save Availability'}
          </Button>
        </div>
      </Card>

      {/* Add Pay Rate modal */}
      <Modal isOpen={showAddRate} onClose={() => setShowAddRate(false)} title="Add Pay Rate" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddRate(false)}>Cancel</Button>
            <Button onClick={() => addRate()}>Add Rate</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Rate per hour ($)" type="number" min="0" step="0.01" value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)} required />
          <Input label="Effective From" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
        </div>
      </Modal>

      {/* Add Qualification modal */}
      <Modal isOpen={showAddQual} onClose={() => setShowAddQual(false)} title="Add Qualification" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddQual(false)}>Cancel</Button>
            <Button onClick={() => addQual()}>Add</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Qualification Name" value={qualName} onChange={(e) => setQualName(e.target.value)} required />
          <Input label="Issued Date" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} required />
          <Input label="Expiry Date (optional)" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      </Modal>

      {/* Add Capability modal */}
      <Modal isOpen={showAddCap} onClose={() => setShowAddCap(false)} title="Add Capability" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddCap(false)}>Cancel</Button>
            <Button onClick={() => addCap()}>Add</Button>
          </div>
        }
      >
        <Select
          label="Class Type"
          value={capClassType}
          onChange={(e) => setCapClassType(e.target.value)}
          options={classTypes.map((ct) => ({ value: ct.id, label: ct.name }))}
          placeholder="Select class type"
          required
        />
      </Modal>
    </div>
  )
}
