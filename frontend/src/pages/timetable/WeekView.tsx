import React from 'react'
import { format, addDays, isSameDay } from 'date-fns'
import { Clock, MapPin } from 'lucide-react'
import type { TimetableEvent, TimetableEventStatus, TimetableTileStyle } from '../../types'
import { DEFAULT_TILE_STYLE, tileColours } from './tileColours'
import { useGymTimezone } from '../../hooks/useGymTimezone'
import { gymNow } from '../../lib/gymTime'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TimetableEventStatus,
  { label: string; badgeBg: string; badgeText: string; dotBg: string }
> = {
  completed:   { label: 'Completed',          badgeBg: 'bg-green-100',  badgeText: 'text-green-700',  dotBg: 'bg-green-500' },
  scheduled:   { label: 'Scheduled',          badgeBg: 'bg-cyan-100',   badgeText: 'text-cyan-700',   dotBg: 'bg-cyan-500' },
  unfilled:    { label: 'Unfilled',           badgeBg: 'bg-amber-100',  badgeText: 'text-amber-700',  dotBg: 'bg-amber-500' },
  awaiting_attendance: { label: 'Awaiting Attendance', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', dotBg: 'bg-orange-500' },
  needs_cover: { label: 'Needs Cover',         badgeBg: 'bg-red-100',    badgeText: 'text-red-700',    dotBg: 'bg-red-500' },
  cancelled:   { label: 'Cancelled',           badgeBg: 'bg-gray-100',   badgeText: 'text-gray-500',   dotBg: 'bg-gray-400' },
}

// ─── Viability color config ───────────────────────────────────────────────────

const VIABILITY_DOT_CLASS: Record<string, string> = {
  pending: 'bg-gray-400',
  red:     'bg-red-500',
  amber:   'bg-amber-400',
  green:   'bg-green-500',
  purple:  'bg-purple-500',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`
}

// ─── Class card (week view) ───────────────────────────────────────────────────

interface WeekClassCardProps {
  event: TimetableEvent
  tileStyle: TimetableTileStyle
  onClick: (event: TimetableEvent) => void
}

function WeekClassCard({ event, tileStyle, onClick }: WeekClassCardProps) {
  const config = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.scheduled
  // The stripe and background come from the class colour, or the viability
  // pastel once attendance is recorded; status shows in the badge.
  const { style, onDark } = tileColours(event, tileStyle)
  const muted = onDark ? 'text-white/80' : 'text-gray-400'

  return (
    <div
      onClick={() => onClick(event)}
      data-testid="week-class-card"
      style={style}
      className={[
        'rounded-lg border border-gray-100 border-l-4 p-2 cursor-pointer',
        'hover:shadow-md transition-shadow duration-150 select-none',
      ].join(' ')}
    >
      {/* Status badge row */}
      <div className="flex items-start justify-between mb-1 gap-1">
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium leading-none',
            config.badgeBg,
            config.badgeText,
          ].join(' ')}
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dotBg}`} />
          <span className="truncate max-w-[80px]">{config.label}</span>
        </span>

        {event.attendance_count !== null && (
          <span
            className={[
              'h-5 w-5 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0',
              // Matches the tile's viability colour, so a red tile doesn't carry a green count.
              VIABILITY_DOT_CLASS[event.viability_color ?? ''] ?? 'bg-green-500',
            ].join(' ')}
            data-testid="attendance-count"
          >
            {event.attendance_count}
          </span>
        )}
      </div>

      {/* Class name + viability dot */}
      <div className="flex items-center gap-1 min-w-0">
        <p className={`text-xs font-bold truncate leading-snug flex-1 ${onDark ? 'text-white' : 'text-gray-900'}`}>
          {event.class_type_name}
        </p>
        {event.viability_color && (
          <span
            className={[
              'w-2 h-2 rounded-full shrink-0',
              VIABILITY_DOT_CLASS[event.viability_color] ?? 'bg-gray-400',
            ].join(' ')}
            title={`Viability: ${event.viability_color}`}
          />
        )}
      </div>

      {/* Time */}
      <div className={`flex items-center gap-0.5 mt-1 text-xs ${muted}`}>
        <Clock className="h-2.5 w-2.5 shrink-0" />
        <span>{formatTime(event.start_time)} – {formatTime(event.end_time)}</span>
      </div>

      {/* Location */}
      <div className={`flex items-center gap-0.5 mt-0.5 text-xs ${muted}`}>
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{event.site_name}</span>
      </div>

      {/* Instructor */}
      {event.instructor_name && (
        <p className={`text-xs truncate mt-0.5 ${muted}`}>{event.instructor_name.split(' ')[0]}</p>
      )}
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekStart: Date
  events: TimetableEvent[]
  onEventClick: (event: TimetableEvent) => void
  tileStyle?: TimetableTileStyle
}

export function WeekView({ weekStart, events, onEventClick, tileStyle = DEFAULT_TILE_STYLE }: WeekViewProps) {
  const gymTz = useGymTimezone()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = gymNow(gymTz)

  return (
    <div className="grid grid-cols-7 gap-2 min-h-[500px]">
      {days.map((day) => {
        const isToday = isSameDay(day, today)

        // Filter events for this day by `date`, the gym's local calendar day
        // from the server. Deriving the day from start_datetime uses the
        // viewer's timezone instead: a 5am Monday class at an NZ gym is Sunday
        // in UTC, so a viewer on another timezone lost it from the week.
        const dayKey = format(day, 'yyyy-MM-dd')
        const dayEvents = events
          .filter((event) => event.date === dayKey)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))

        return (
          <div key={day.toISOString()} className="flex flex-col gap-1.5 min-w-0">
            {/* Day header — sticks to the top of the page's scroll area so the
                day and date stay readable while scrolling a long day. The
                white backing hides cards scrolling up behind it. -top-6
                cancels the page's p-6, which sticky otherwise keeps clear. */}
            <div className="sticky -top-6 z-10 bg-white pb-1.5 -mb-1.5">
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
            </div>

            {/* Class cards */}
            <div className="flex flex-col gap-1.5 flex-1">
              {dayEvents.length === 0 ? (
                <div className="flex-1 rounded-lg border border-dashed border-gray-150 flex items-center justify-center min-h-[60px]">
                  <span className="text-xs text-gray-200">—</span>
                </div>
              ) : (
                dayEvents.map((event) => (
                  <WeekClassCard key={event.id} event={event} tileStyle={tileStyle} onClick={onEventClick} />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
