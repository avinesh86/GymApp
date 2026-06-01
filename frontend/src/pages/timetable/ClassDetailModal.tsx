import React, { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Clock, User, X, AlertTriangle, Copy, Trash2, RefreshCcw, Repeat2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  updateEvent,
  deleteEvent,
  assignInstructor,
  cancelEvent,
  createEvent,
  createRecurringRule,
  generateRuleEvents,
} from '../../api/timetable'
import { submitAttendanceForEvent } from '../../api/attendance'
import { createCoverRequest } from '../../api/cover'
import { listStaff } from '../../api/staff'
import { listSites } from '../../api/settings'
import type { TimetableEvent, TimetableEventStatus } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { Badge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'details' | 'attendance' | 'edit' | 'manage'

const STATUS_CONFIG: Record<
  TimetableEventStatus,
  { label: string; variant: 'green' | 'cyan' | 'orange' | 'red' | 'grey' }
> = {
  completed:   { label: 'Completed',           variant: 'green' },
  scheduled:   { label: 'Scheduled',           variant: 'cyan' },
  unfilled:    { label: 'Awaiting Attendance',  variant: 'orange' },
  needs_cover: { label: 'Needs Cover',          variant: 'red' },
  cancelled:   { label: 'Cancelled',            variant: 'grey' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-cyan-400 w-full'

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 || 12
  return `${display}:${String(m).padStart(2, '0')} ${period}`
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ event }: { event: TimetableEvent }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-400">Time</p>
            <p className="text-sm font-medium text-gray-800">
              {to12Hour(event.start_time)} – {to12Hour(event.end_time)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-400">Location</p>
            <p className="text-sm font-medium text-gray-800">{event.site_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 col-span-2">
          <User className="h-4 w-4 text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-400">Instructor</p>
            <p className="text-sm font-medium text-gray-800">
              {event.instructor_name ?? 'Unassigned'}
            </p>
          </div>
        </div>
      </div>

      {event.attendance_count !== null ? (
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-sm font-semibold text-green-700">
            Attendance recorded: {event.attendance_count} attendees
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-sm text-gray-400">No attendance recorded yet</p>
        </div>
      )}

      {event.notes && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
          <p className="text-sm text-gray-700">{event.notes}</p>
        </div>
      )}
    </div>
  )
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────

function AttendanceTab({ event, onClose }: { event: TimetableEvent; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [count, setCount] = useState<string>(
    event.attendance_count !== null ? String(event.attendance_count) : ''
  )

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => submitAttendanceForEvent(event.id, Number(count)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Attendance recorded')
      onClose()
    },
    onError: () => toast.error('Failed to record attendance'),
  })

  const quickValues = [0, 5, 10, 15, 20, 25, 30]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3">Attendance Count</p>
        <input
          type="number"
          min={0}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="Enter number of attendees"
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {quickValues.map((v) => (
          <button
            key={v}
            onClick={() => setCount(String(v))}
            className={[
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              count === String(v)
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={() => submit()}
        disabled={isPending || count === ''}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          '✓ Submit Attendance'
        )}
      </button>

      <button
        onClick={onClose}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400">○</span> No Attendance Recorded
      </button>
    </div>
  )
}

// ─── Day of week config (shared) ─────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { frontendValue: 1, label: 'Mon' },
  { frontendValue: 2, label: 'Tue' },
  { frontendValue: 3, label: 'Wed' },
  { frontendValue: 4, label: 'Thu' },
  { frontendValue: 5, label: 'Fri' },
  { frontendValue: 6, label: 'Sat' },
  { frontendValue: 0, label: 'Sun' },
]

/** Frontend day values (Mon=1…Sat=6, Sun=0) → Python weekday (Mon=0…Sun=6). */
function toBackendDayOfWeek(frontendDay: number): number {
  return frontendDay === 0 ? 6 : frontendDay - 1
}

// ─── Edit Tab ─────────────────────────────────────────────────────────────────

function EditTab({ event, onSaved }: { event: TimetableEvent; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [date, setDate]             = useState(event.date)
  const [startTime, setStartTime]   = useState(event.start_time)
  const [endTime, setEndTime]       = useState(event.end_time)
  const [siteId, setSiteId]         = useState(String(event.site))
  const [notes, setNotes]           = useState(event.notes ?? '')
  const [internalNotes, setInternalNotes] = useState(event.internal_notes ?? '')

  // ── Recurring state ──────────────────────────────────────────────────────
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [recurringDays, setRecurringDays] = useState<number[]>([])
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [isCreatingRecurring, setIsCreatingRecurring] = useState(false)

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: listSites })

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      updateEvent(event.id, {
        start_datetime: `${date}T${startTime}:00`,
        end_datetime:   `${date}T${endTime}:00`,
        site:           Number(siteId),
        notes,
        internal_notes: internalNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Class updated')
      onSaved()
    },
    onError: () => toast.error('Failed to update class'),
  })

  function toggleDay(frontendValue: number) {
    setRecurringDays((prev) =>
      prev.includes(frontendValue)
        ? prev.filter((d) => d !== frontendValue)
        : [...prev, frontendValue]
    )
  }

  async function handleSave() {
    if (!makeRecurring) {
      save()
      return
    }

    if (recurringDays.length === 0) {
      toast.error('Select at least one day')
      return
    }

    setIsCreatingRecurring(true)
    let totalCreated = 0
    let hadError = false

    try {
      // First save the event edits
      await updateEvent(event.id, {
        start_datetime: `${date}T${startTime}:00`,
        end_datetime:   `${date}T${endTime}:00`,
        site:           Number(siteId),
        notes,
        internal_notes: internalNotes,
      })

      // Then create a recurring rule per selected day and generate sessions
      for (const frontendDay of recurringDays) {
        const rule = await createRecurringRule({
          class_type:  event.class_type as unknown as number,
          instructor:  event.instructor as unknown as number | null,
          site:        Number(siteId),
          day_of_week: toBackendDayOfWeek(frontendDay),
          start_time:  `${startTime}:00`,
          valid_from:  date,
          valid_to:    recurringEndDate || null,
        })
        const result = await generateRuleEvents(rule.id)
        totalCreated += result.created
      }
    } catch {
      hadError = true
      toast.error('Failed to create recurring sessions')
    } finally {
      setIsCreatingRecurring(false)
    }

    if (!hadError) {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success(
        totalCreated > 0
          ? `Class updated · ${totalCreated} recurring sessions created`
          : 'Class updated · recurring rule saved'
      )
      onSaved()
    }
  }

  const isPending = isSaving || isCreatingRecurring

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Location</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Instructor Notes (visible to instructor)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="Notes visible to instructor..."
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Internal Notes (admin only)</label>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="Private admin notes..."
        />
      </div>

      {/* ── Recurring section — super admins only ────────────────────────── */}
      {isSuperAdmin && <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={makeRecurring}
            onChange={(e) => setMakeRecurring(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
          />
          <span className="text-sm font-medium text-gray-700">Make recurring</span>
        </label>

        {makeRecurring && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-2">Repeat on</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.frontendValue}
                    type="button"
                    onClick={() => toggleDay(day.frontendValue)}
                    className={[
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      recurringDays.includes(day.frontendValue)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100',
                    ].join(' ')}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {makeRecurring && recurringDays.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Select at least one day</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">End Date (optional)</label>
              <input
                type="date"
                value={recurringEndDate}
                onChange={(e) => setRecurringEndDate(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave blank to generate 12 weeks of sessions
              </p>
            </div>
          </div>
        )}
      </div>}

      <button
        onClick={handleSave}
        disabled={isPending || (makeRecurring && recurringDays.length === 0)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (isSuperAdmin && makeRecurring) ? (
          '↻ Save & Create Recurring'
        ) : (
          '💾 Save Changes'
        )}
      </button>
    </div>
  )
}

// ─── Manage Tab ───────────────────────────────────────────────────────────────

function ManageTab({ event, onClose }: { event: TimetableEvent; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedInstructor, setSelectedInstructor] = useState(String(event.instructor ?? ''))
  const [showCancelConfirm, setShowCancelConfirm]   = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false)

  const { data: staffPage } = useQuery({
    queryKey: ['staff', { status: 'active' }],
    queryFn: () => listStaff({ status: 'active' }),
  })
  const staffList = staffPage?.results ?? []

  const { mutate: updateAssignment, isPending: isAssigning } = useMutation({
    mutationFn: () => assignInstructor(event.id, Number(selectedInstructor)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Instructor updated')
    },
    onError: () => toast.error('Failed to update assignment'),
  })

  const { mutate: requestCover, isPending: isRequestingCover } = useMutation({
    mutationFn: () => createCoverRequest({ timetable_event: event.id, urgency: 'high' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      toast.success('Cover request created')
      onClose()
    },
    onError: () => toast.error('Failed to create cover request'),
  })

  const { mutate: duplicate, isPending: isDuplicating } = useMutation({
    mutationFn: () =>
      createEvent({
        class_type:      event.class_type,
        instructor:      event.instructor,
        site:            event.site,
        start_datetime:  event.start_datetime,
        end_datetime:    event.end_datetime,
        capacity:        event.capacity,
        notes:           event.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Class duplicated')
      onClose()
    },
    onError: () => toast.error('Failed to duplicate class'),
  })

  const { mutate: doCancel, isPending: isCancelling } = useMutation({
    mutationFn: () => cancelEvent(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Class cancelled')
      onClose()
    },
    onError: () => toast.error('Failed to cancel class'),
  })

  const { mutate: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteEvent(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Class deleted')
      onClose()
    },
    onError: () => toast.error('Failed to delete class'),
  })

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Assign instructor */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Assign Instructor</p>
          <div className="flex gap-2">
            <select
              value={selectedInstructor}
              onChange={(e) => setSelectedInstructor(e.target.value)}
              className={`${inputClass} flex-1`}
            >
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => updateAssignment()}
            disabled={isAssigning || !selectedInstructor}
            className="w-full mt-2 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isAssigning ? 'Updating…' : 'Update Assignment'}
          </button>
        </div>

        <hr className="border-gray-100" />

        {/* Cover request */}
        <button
          onClick={() => requestCover()}
          disabled={isRequestingCover}
          className="w-full py-2.5 rounded-xl border border-orange-200 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          {isRequestingCover ? 'Creating…' : 'Create Cover Request'}
        </button>

        {/* Duplicate + Cancel side by side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => duplicate()}
            disabled={isDuplicating}
            className="py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <Copy className="h-4 w-4" />
            {isDuplicating ? 'Copying…' : 'Duplicate'}
          </button>
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={event.status === 'cancelled'}
            className="py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="h-4 w-4" />
            Cancel Class
          </button>
        </div>

        {/* Delete permanently */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-2.5 rounded-xl border border-red-100 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete Permanently
        </button>
      </div>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => doCancel()}
        title="Cancel Class"
        message="Are you sure you want to cancel this class?"
        confirmLabel="Cancel Class"
        isLoading={isCancelling}
        variant="danger"
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => doDelete()}
        title="Delete Class Permanently"
        message="This will permanently delete the class and cannot be undone."
        confirmLabel="Delete"
        isLoading={isDeleting}
        variant="danger"
      />
    </>
  )
}

// ─── Class Detail Modal ───────────────────────────────────────────────────────

interface ClassDetailModalProps {
  event: TimetableEvent | null
  onClose: () => void
}

export function ClassDetailModal({ event, onClose }: ClassDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('details')

  if (!event) return null

  const statusConfig = STATUS_CONFIG[event.status] ?? { label: event.status, variant: 'grey' as const }
  const isRecurring = !!(event.recurring_pattern_id || (event as unknown as { recurring_rule?: number }).recurring_rule)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details',    label: 'Details' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'edit',       label: 'Edit' },
    { key: 'manage',     label: 'Manage' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) { setActiveTab('details'); onClose() } }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={() => { setActiveTab('details'); onClose() }} />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between mb-1.5">
            <h2 className="text-lg font-bold text-gray-900 pr-4">{event.class_type_name}</h2>
            <button
              onClick={() => { setActiveTab('details'); onClose() }}
              className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">
              {format(new Date(event.date), 'EEEE, MMMM d, yyyy')}
            </span>
            <Badge variant={statusConfig.variant} dot>
              {statusConfig.label}
            </Badge>
            {isRecurring && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                <RefreshCcw className="h-3 w-3" />
                Recurring
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'details'    && <DetailsTab event={event} />}
          {activeTab === 'attendance' && <AttendanceTab event={event} onClose={onClose} />}
          {activeTab === 'edit'       && <EditTab event={event} onSaved={() => { setActiveTab('details'); onClose() }} />}
          {activeTab === 'manage'     && <ManageTab event={event} onClose={() => { setActiveTab('details'); onClose() }} />}
        </div>
      </div>
    </div>
  )
}
