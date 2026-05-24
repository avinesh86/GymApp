import React from 'react'
import { MapPin, Users } from 'lucide-react'
import type { TimetableEvent, TimetableEventStatus } from '../../types'

const STATUS_CONFIG: Record<
  TimetableEventStatus,
  { label: string; border: string; badge: string; dot: string }
> = {
  scheduled:          { label: 'Scheduled',          border: 'border-cyan-400',   badge: 'bg-cyan-100 text-cyan-700',   dot: 'bg-cyan-500' },
  unfilled:           { label: 'Awaiting Attendance', border: 'border-orange-400', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  needs_cover:        { label: 'Needs Cover',         border: 'border-red-400',    badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  cancelled:          { label: 'Cancelled',           border: 'border-gray-300',   badge: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400' },
  completed:          { label: 'Completed',           border: 'border-green-400',  badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
}

interface ClassCardProps {
  event: TimetableEvent
  onClick: (event: TimetableEvent) => void
  compact?: boolean
}

export function ClassCard({ event, onClick, compact = false }: ClassCardProps) {
  const config = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.scheduled

  return (
    <div
      onClick={() => onClick(event)}
      className={[
        'bg-white rounded-lg border-l-4 border border-gray-100 p-2.5 cursor-pointer',
        'hover:shadow-md transition-shadow duration-150',
        config.border,
      ].join(' ')}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {config.label}
        </span>
        {event.attendance_count !== null && (
          <span className="h-5 w-5 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">
            {event.attendance_count}
          </span>
        )}
      </div>

      {/* Class name */}
      <p className={`font-semibold text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
        {event.class_type_name}
      </p>

      {/* Time */}
      <p className="text-xs text-gray-500 mt-0.5">
        {formatTime(event.start_time)} – {formatTime(event.end_time)}
      </p>

      {/* Location */}
      {!compact && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
          <MapPin className="h-3 w-3" />
          {event.site_name}
        </div>
      )}
    </div>
  )
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`
}
