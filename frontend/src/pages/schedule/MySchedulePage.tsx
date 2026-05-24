import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ArrowLeft, ArrowRight, Calendar, Clock, MapPin } from 'lucide-react'
import { listEvents } from '../../api/timetable'
import { createAttendance } from '../../api/attendance'
import { getMyStaffProfile } from '../../api/staff'
import apiClient from '../../api/client'
import type { TimetableEvent, TimetableEventStatus } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'upcoming' | 'past'

interface AbsencePayload {
  staff: number
  reason: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<TimetableEventStatus, { label: string; variant: 'green' | 'blue' | 'orange' | 'red' | 'grey' | 'cyan' }> = {
  scheduled:   { label: 'Scheduled',    variant: 'blue' },
  completed:   { label: 'Completed',    variant: 'green' },
  unfilled:    { label: 'Unfilled',     variant: 'orange' },
  needs_cover: { label: 'Needs Cover',  variant: 'red' },
  cancelled:   { label: 'Cancelled',    variant: 'grey' },
}

// Maps attendance count to a viability colour dot using class viability thresholds.
// Since we don't have the thresholds on TimetableEvent, we use a simple pending
// indicator when attendance hasn't been recorded yet.
function viabilityDotClass(count: number | null): string {
  if (count === null) return 'bg-gray-300'
  if (count === 0) return 'bg-red-400'
  if (count < 5) return 'bg-amber-400'
  if (count < 10) return 'bg-yellow-400'
  return 'bg-green-500'
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  return `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`
}

function groupEventsByDate(events: TimetableEvent[]): Array<{ date: string; events: TimetableEvent[] }> {
  const grouped = new Map<string, TimetableEvent[]>()

  for (const event of events) {
    const existing = grouped.get(event.date) ?? []
    existing.push(event)
    grouped.set(event.date, existing)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateEvents]) => ({ date, events: dateEvents }))
}

// ─── Event Card ───────────────────────────────────────────────────────────────

interface EventCardProps {
  event: TimetableEvent
  staffId: number
  onAbsenceRequest: (event: TimetableEvent) => void
}

function EventCard({ event, staffId, onAbsenceRequest }: EventCardProps) {
  const queryClient = useQueryClient()
  const [attendanceInput, setAttendanceInput] = useState<string>('')
  const [showAttendanceInput, setShowAttendanceInput] = useState(false)

  const statusMeta = STATUS_BADGE[event.status] ?? { label: event.status, variant: 'grey' as const }
  const hasAttendance = event.attendance_count !== null

  const { mutate: submitAttendance, isPending: isSubmitting } = useMutation({
    mutationFn: () =>
      createAttendance({ event: event.id, count: Number(attendanceInput) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] })
      toast.success('Attendance submitted')
      setShowAttendanceInput(false)
      setAttendanceInput('')
    },
    onError: () => toast.error('Failed to submit attendance'),
  })

  return (
    <Card className="mb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-gray-900 text-sm">{event.class_type_name}</p>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            {event.status === 'completed' && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`h-2 w-2 rounded-full ${viabilityDotClass(event.attendance_count)}`} />
                {hasAttendance ? `${event.attendance_count} attended` : 'No attendance'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {event.start_time} – {event.end_time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {event.site_name}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {event.status === 'completed' && !hasAttendance && !showAttendanceInput && (
            <Button size="sm" onClick={() => setShowAttendanceInput(true)}>
              Submit Attendance
            </Button>
          )}
          {event.status === 'scheduled' && (
            <Button size="sm" variant="danger" onClick={() => onAbsenceRequest(event)}>
              Mark Absent
            </Button>
          )}
        </div>
      </div>

      {showAttendanceInput && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
          <label className="text-sm text-gray-600 font-medium whitespace-nowrap">
            Attendee count
          </label>
          <input
            type="number"
            min="0"
            max="999"
            value={attendanceInput}
            onChange={(e) => setAttendanceInput(e.target.value)}
            className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="0"
            autoFocus
          />
          <Button
            size="sm"
            onClick={() => submitAttendance()}
            isLoading={isSubmitting}
            disabled={attendanceInput === ''}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAttendanceInput(false)}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}

// ─── My Schedule Page ─────────────────────────────────────────────────────────

export function MySchedulePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming')
  const [absenceEvent, setAbsenceEvent] = useState<TimetableEvent | null>(null)
  const [absenceReason, setAbsenceReason] = useState('')
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false)

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

  const { data: staffProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: getMyStaffProfile,
    enabled: !!user,
  })

  const staffId = staffProfile?.id

  // Upcoming: current week onward
  const { data: upcomingEvents = [], isLoading: isLoadingUpcoming } = useQuery({
    queryKey: ['schedule-events', 'upcoming', format(weekStart, 'yyyy-MM-dd'), staffId],
    queryFn: () =>
      listEvents({
        instructor: staffId,
        from: format(weekStart, 'yyyy-MM-dd'),
        to: format(weekEnd, 'yyyy-MM-dd'),
      }),
    enabled: !!staffId && activeTab === 'upcoming',
  })

  // Past: 4 weeks back from start of this week
  const pastFrom = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 4)
  const pastTo   = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 0)

  const { data: pastEvents = [], isLoading: isLoadingPast } = useQuery({
    queryKey: ['schedule-events', 'past', staffId],
    queryFn: () =>
      listEvents({
        instructor: staffId,
        from: format(pastFrom, 'yyyy-MM-dd'),
        to: format(pastTo, 'yyyy-MM-dd'),
      }),
    enabled: !!staffId && activeTab === 'past',
  })

  const today = startOfDay(new Date())

  const filteredUpcoming = upcomingEvents.filter(
    (event) => !isBefore(parseISO(event.date), today)
  )

  const filteredPast = pastEvents.filter(
    (event) => isBefore(parseISO(event.date), today)
  )

  const activeEvents = activeTab === 'upcoming' ? filteredUpcoming : filteredPast
  const isLoading = isLoadingProfile || (activeTab === 'upcoming' ? isLoadingUpcoming : isLoadingPast)
  const grouped = groupEventsByDate(activeEvents)

  async function handleSubmitAbsence() {
    if (!staffId || !absenceEvent) return

    setIsSubmittingAbsence(true)
    try {
      const payload: AbsencePayload = { staff: staffId, reason: absenceReason }
      await apiClient.post('cover/absences/', payload)
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] })
      toast.success('Absence reported')
      setAbsenceEvent(null)
      setAbsenceReason('')
    } catch {
      toast.error('Failed to report absence')
    } finally {
      setIsSubmittingAbsence(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="My Schedule" />

      {/* Week navigation (only shown in Upcoming tab) */}
      {activeTab === 'upcoming' && (
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Previous week"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 flex-1 text-center">
            {formatWeekLabel(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Next week"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {(['upcoming', 'past'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={activeTab === 'upcoming' ? 'No upcoming classes this week' : 'No past classes found'}
          description={activeTab === 'upcoming' ? 'Move to a different week or check back later' : 'Classes from the past 4 weeks appear here'}
        />
      ) : (
        grouped.map(({ date, events }) => (
          <section key={date} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              {format(parseISO(date), 'EEEE d MMMM')}
            </h2>
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                staffId={staffId ?? 0}
                onAbsenceRequest={setAbsenceEvent}
              />
            ))}
          </section>
        ))
      )}

      {/* Mark Absent modal */}
      <Modal
        isOpen={absenceEvent !== null}
        onClose={() => { setAbsenceEvent(null); setAbsenceReason('') }}
        title="Report Absence"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => { setAbsenceEvent(null); setAbsenceReason('') }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleSubmitAbsence}
              isLoading={isSubmittingAbsence}
              disabled={absenceReason.trim() === ''}
            >
              Report Absence
            </Button>
          </div>
        }
      >
        {absenceEvent && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
              <p className="font-medium">{absenceEvent.class_type_name}</p>
              <p className="text-gray-500 mt-0.5">
                {format(parseISO(absenceEvent.date), 'EEEE d MMMM')} · {absenceEvent.start_time} – {absenceEvent.end_time}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Reason for absence</label>
              <textarea
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                rows={3}
                placeholder="Please provide a reason..."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
