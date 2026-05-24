import React from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { TimetableEvent } from '../../types'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'

interface ListViewProps {
  events: TimetableEvent[]
  onEventClick: (event: TimetableEvent) => void
  page: number
  onPageChange: (page: number) => void
  totalCount: number
  pageSize?: number
}

const VIABILITY_DOT_CLASS: Record<string, string> = {
  pending: 'bg-gray-400',
  red:     'bg-red-500',
  amber:   'bg-amber-400',
  green:   'bg-green-500',
  purple:  'bg-purple-500',
}

const STATUS_VARIANTS: Record<string, 'green' | 'blue' | 'orange' | 'red' | 'grey'> = {
  completed:   'green',
  scheduled:   'blue',
  unfilled:    'orange',
  needs_cover: 'red',
  cancelled:   'grey',
}

const STATUS_LABELS: Record<string, string> = {
  completed:   'Completed',
  scheduled:   'Scheduled',
  unfilled:    'Awaiting Attendance',
  needs_cover: 'Needs Cover',
  cancelled:   'Cancelled',
}

export function ListView({
  events,
  onEventClick,
  page,
  onPageChange,
  totalCount,
  pageSize = 20,
}: ListViewProps) {
  const totalPages = Math.ceil(totalCount / pageSize)

  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (event: TimetableEvent) => (
        <span className="text-sm text-gray-700">
          {format(new Date(event.date), 'EEE, d MMM yyyy')}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      render: (event: TimetableEvent) => (
        <div className="flex items-center gap-2">
          {event.viability_color && (
            <span
              className={[
                'w-2 h-2 rounded-full shrink-0',
                VIABILITY_DOT_CLASS[event.viability_color] ?? 'bg-gray-400',
              ].join(' ')}
              title={`Viability: ${event.viability_color}`}
            />
          )}
          <span className="font-medium text-gray-900">{event.class_type_name}</span>
        </div>
      ),
    },
    {
      key: 'instructor',
      header: 'Instructor',
      render: (event: TimetableEvent) => (
        <span className="text-gray-600">{event.instructor_name ?? '—'}</span>
      ),
    },
    {
      key: 'site',
      header: 'Location',
      render: (event: TimetableEvent) => (
        <span className="text-gray-600">{event.site_name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (event: TimetableEvent) => (
        <Badge variant={STATUS_VARIANTS[event.status] ?? 'grey'} dot>
          {STATUS_LABELS[event.status] ?? event.status}
        </Badge>
      ),
    },
    {
      key: 'attendance',
      header: 'Attendance',
      render: (event: TimetableEvent) => (
        <span className="text-gray-600">
          {event.attendance_count !== null ? event.attendance_count : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (event: TimetableEvent) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onEventClick(event)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Table
        columns={columns}
        data={events}
        keyExtractor={(event) => event.id}
        onRowClick={onEventClick}
        emptyMessage="No classes found for this period"
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-2">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({totalCount} classes)
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
