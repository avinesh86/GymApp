import React from 'react'
import { Clock, MapPin, User, DollarSign, XCircle } from 'lucide-react'
import { format, isPast, parseISO } from 'date-fns'
import type { CoverRequest } from '../../types'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'

const URGENCY_CONFIG = {
  low:      { label: 'Low Urgency',    variant: 'yellow' as const },
  high:     { label: 'High Urgency',   variant: 'orange' as const },
  critical: { label: 'Critical',       variant: 'darkred' as const },
}

const STATUS_CONFIG = {
  open:      { label: 'Open',     variant: 'yellow' as const },
  offered:   { label: 'Offered',  variant: 'blue' as const },
  accepted:  { label: 'Accepted', variant: 'green' as const },
  cancelled: { label: 'Cancelled',variant: 'grey' as const },
  expired:   { label: 'Expired',  variant: 'grey' as const },
}

interface CoverRequestCardProps {
  request: CoverRequest
  onViewDetails: (request: CoverRequest) => void
  muted?: boolean
}

export function CoverRequestCard({ request, onViewDetails, muted = false }: CoverRequestCardProps) {
  const urgency = URGENCY_CONFIG[request.urgency]
  const status = STATUS_CONFIG[request.status]
  const event = request.event_detail
  const eventIsPast = event?.start_datetime
    ? isPast(parseISO(event.start_datetime))
    : isPast(parseISO(event.date))

  return (
    <div className={[
      'bg-white rounded-xl border border-gray-100 shadow-sm p-4',
      muted ? 'opacity-70' : '',
    ].join(' ')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{event.class_type_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {format(new Date(event.date), 'EEE, d MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {eventIsPast && !['accepted', 'cancelled', 'expired'].includes(request.status) && (
            <Badge variant="grey">Past</Badge>
          )}
          <Badge variant={urgency.variant}>{urgency.label}</Badge>
          <Badge variant={status.variant} dot>{status.label}</Badge>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {event.start_time} – {event.end_time}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-gray-400" />
          {event.site_name}
        </span>
        <span className="flex items-center gap-1.5 col-span-2">
          <User className="h-3.5 w-3.5 text-gray-400" />
          Original: {request.original_instructor_name}
        </span>
      </div>

      {/* Bonus */}
      {request.bonus_amount && Number(request.bonus_amount) > 0 && (
        <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 mb-3 w-fit">
          <DollarSign className="h-3.5 w-3.5 text-green-600" />
          <span className="text-sm font-semibold text-green-700">
            +${request.bonus_amount} bonus
          </span>
        </div>
      )}

      {/* Cancellation reason — shown on cancelled cards */}
      {request.status === 'cancelled' && request.cancellation_reason && (
        <div className="flex gap-1.5 bg-red-50 rounded-lg px-3 py-2 mb-3 text-xs text-red-600">
          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{request.cancellation_reason}</span>
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => onViewDetails(request)}
      >
        View Details
      </Button>
    </div>
  )
}
