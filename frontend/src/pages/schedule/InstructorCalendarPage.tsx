import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { listEvents } from '../../api/timetable'
import { getMyStaffProfile } from '../../api/staff'
import type { TimetableEvent, TimetableEventStatus } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  TimetableEventStatus,
  { label: string; variant: 'green' | 'blue' | 'orange' | 'red' | 'grey' | 'cyan' }
> = {
  scheduled:   { label: 'Scheduled',   variant: 'blue' },
  completed:   { label: 'Completed',   variant: 'green' },
  unfilled:    { label: 'Unfilled',    variant: 'orange' },
  needs_cover: { label: 'Needs Cover', variant: 'red' },
  cancelled:   { label: 'Cancelled',   variant: 'grey' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`
}

function eventsForDay(events: TimetableEvent[], day: Date): TimetableEvent[] {
  return events
    .filter((event) => isSameDay(parseISO(event.date), day))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
}

// ─── Own event card ───────────────────────────────────────────────────────────

function OwnEventCard({ event }: { event: TimetableEvent }) {
  const statusMeta = STATUS_BADGE[event.status] ?? { label: event.status, variant: 'grey' as const }

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <p className="text-xs font-semibold text-cyan-900 truncate">{event.class_type_name}</p>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>
      <div className="flex items-center gap-1 text-xs text-cyan-700">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{formatTime(event.start_time)} – {formatTime(event.end_time)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-cyan-600">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.site_name}</span>
      </div>
    </div>
  )
}

// ─── Cover opportunity card ───────────────────────────────────────────────────

interface CoverOpportunityCardProps {
  event: TimetableEvent
  onAccept: () => void
}

function CoverOpportunityCard({ event, onAccept }: CoverOpportunityCardProps) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 flex flex-col gap-1">
      <p className="text-xs font-semibold text-orange-900 truncate">{event.class_type_name}</p>
      <div className="flex items-center gap-1 text-xs text-orange-700">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{formatTime(event.start_time)} – {formatTime(event.end_time)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-orange-600">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.site_name}</span>
      </div>
      <button
        onClick={onAccept}
        className="mt-1 w-full rounded-md bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium py-1 transition-colors"
      >
        Accept Cover
      </button>
    </div>
  )
}

// ─── Day column ───────────────────────────────────────────────────────────────

interface DayColumnProps {
  day: Date
  ownEvents: TimetableEvent[]
  coverEvents: TimetableEvent[]
  onAcceptCover: () => void
}

function DayColumn({ day, ownEvents, coverEvents, onAcceptCover }: DayColumnProps) {
  const isToday = isSameDay(day, new Date())
  const dayOwnEvents = eventsForDay(ownEvents, day)
  const dayCoverEvents = eventsForDay(coverEvents, day)
  const isEmpty = dayOwnEvents.length === 0 && dayCoverEvents.length === 0

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {/* Day header */}
      <div
        className={[
          'rounded-lg p-2 text-center',
          isToday ? 'bg-cyan-500' : 'bg-gray-50 border border-gray-100',
        ].join(' ')}
      >
        <p className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-cyan-100' : 'text-gray-400'}`}>
          {format(day, 'EEE')}
        </p>
        <p className={`text-base font-bold leading-none mt-0.5 ${isToday ? 'text-white' : 'text-gray-900'}`}>
          {format(day, 'd')}
        </p>
      </div>

      {/* Events */}
      <div className="flex flex-col gap-1.5 flex-1">
        {isEmpty ? (
          <div className="flex-1 rounded-lg border border-dashed border-gray-200 flex items-center justify-center min-h-[60px]">
            <span className="text-xs text-gray-300">No classes</span>
          </div>
        ) : (
          <>
            {dayOwnEvents.map((event) => (
              <OwnEventCard key={event.id} event={event} />
            ))}
            {dayCoverEvents.map((event) => (
              <CoverOpportunityCard
                key={event.id}
                event={event}
                onAccept={onAcceptCover}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── InstructorCalendarPage ───────────────────────────────────────────────────

export function InstructorCalendarPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const fromParam = format(weekStart, 'yyyy-MM-dd')
  const toParam = format(weekEnd, 'yyyy-MM-dd')

  const { data: staffProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: getMyStaffProfile,
    enabled: !!user,
  })

  const staffId = staffProfile?.id

  // Fetch the instructor's own events for the week
  const { data: ownEvents = [], isLoading: isLoadingOwn } = useQuery({
    queryKey: ['instructor-calendar', 'own', fromParam, staffId],
    queryFn: () => listEvents({ instructor: staffId, from: fromParam, to: toParam }),
    enabled: !!staffId,
  })

  // Fetch all events needing cover for the week (potential opportunities)
  const { data: coverEvents = [], isLoading: isLoadingCover } = useQuery({
    queryKey: ['instructor-calendar', 'cover', fromParam],
    queryFn: () => listEvents({ status: 'needs_cover', from: fromParam, to: toParam }),
    enabled: !!staffId,
  })

  // Exclude events the instructor is already assigned to
  const coverOpportunities = coverEvents.filter(
    (coverEvent) => !ownEvents.some((own) => own.id === coverEvent.id)
  )

  const isLoading = isLoadingProfile || isLoadingOwn || isLoadingCover

  function navigatePrev() {
    setWeekStart((current) => subWeeks(current, 1))
  }

  function navigateNext() {
    setWeekStart((current) => addWeeks(current, 1))
  }

  function goToToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  function handleAcceptCover() {
    // Navigate to the cover board where the instructor can accept the cover request
    navigate('/cover')
  }

  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`

  return (
    <div className="max-w-full">
      <PageHeader title="My Calendar" subtitle="Your weekly schedule and cover opportunities" />

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={navigatePrev}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Today
        </button>

        <button
          onClick={navigateNext}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <span className="text-sm font-medium text-gray-700 ml-1">{weekLabel}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-cyan-200 border border-cyan-400" />
          Your classes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-200 border border-orange-400" />
          Cover opportunities
        </span>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {isLoading ? (
          <PageSpinner />
        ) : (
          <div className="grid grid-cols-7 gap-2 min-h-[400px]">
            {weekDays.map((day) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                ownEvents={ownEvents}
                coverEvents={coverOpportunities}
                onAcceptCover={handleAcceptCover}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
