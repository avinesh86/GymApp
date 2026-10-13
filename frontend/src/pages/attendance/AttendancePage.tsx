import React, { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { ClipboardList, Clock, MapPin, User, Check } from 'lucide-react'
import { listAttendance, countAwaitingAttendance, submitAttendanceForEvent } from '../../api/attendance'
import type { AttendanceRecord } from '../../types'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { DATE_TABS, getDateRange, type DateTab } from './dateRanges'

const QUICK_PICKS = [0, 5, 10, 15, 20, 25, 30]

export function AttendancePage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<DateTab>('today')
  // Keyed by class, so a number typed on one tab is still there after a look
  // at another.
  const [inputValues, setInputValues] = useState<Map<number, string>>(new Map())

  // Each tab is filtered by the server rather than from one big list: the
  // awaiting list is capped at 100, so with a backlog a single fetch would
  // leave the older tabs short.
  const { data: awaitingRecords = [], isLoading } = useQuery({
    queryKey: ['attendance', 'awaiting-list', activeTab],
    queryFn: () => listAttendance({ awaiting: true, ...getDateRange(activeTab) }),
  })

  const countQueries = useQueries({
    queries: DATE_TABS.map((tab) => ({
      queryKey: ['attendance', 'awaiting-count', tab.key],
      queryFn: () => countAwaitingAttendance(getDateRange(tab.key)),
    })),
  })
  const tabCounts = Object.fromEntries(
    DATE_TABS.map((tab, index) => [tab.key, countQueries[index].data ?? 0]),
  ) as Record<DateTab, number>
  const totalAwaiting = DATE_TABS.reduce((sum, tab) => sum + tabCounts[tab.key], 0)

  const { mutate: submitAttendance, isPending, variables: saving } = useMutation({
    mutationFn: ({ eventId, count }: { eventId: number; count: number }) =>
      submitAttendanceForEvent(eventId, count),
    onSuccess: () => {
      // Everything under 'attendance': this page's lists and counts, and the
      // dashboard's awaiting panel.
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      toast.success('Attendance saved')
    },
    onError: () => toast.error('Failed to save attendance'),
  })

  function setInput(eventId: number, value: string) {
    setInputValues((prev) => new Map(prev).set(eventId, value))
  }

  function handleSubmit(eventId: number) {
    const value = inputValues.get(eventId)
    if (value === undefined || value === '') return
    submitAttendance({ eventId, count: Number(value) })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Attendance Entry"
        subtitle={`${totalAwaiting} class${totalAwaiting !== 1 ? 'es' : ''} awaiting attendance`}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {DATE_TABS.map((tab) => {
          const count = tabCounts[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
              {count > 0 && (
                <span className="h-5 min-w-5 px-1 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Classes */}
      {isLoading ? (
        <PageSpinner />
      ) : awaitingRecords.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No classes awaiting attendance"
          description="All classes for this period have been recorded"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {awaitingRecords.map((record) => (
            <AttendanceCard
              key={record.event}
              record={record}
              inputValue={inputValues.get(record.event) ?? ''}
              isSaving={isPending && saving?.eventId === record.event}
              onInputChange={(value) => setInput(record.event, value)}
              onSubmit={() => handleSubmit(record.event)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface AttendanceCardProps {
  record: AttendanceRecord
  inputValue: string
  isSaving: boolean
  onInputChange: (value: string) => void
  onSubmit: () => void
}

function AttendanceCard({ record, inputValue, isSaving, onInputChange, onSubmit }: AttendanceCardProps) {
  const event = record.event_detail

  if (!event) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{event.class_type_name}</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {/* event.date is the gym's own day; start_datetime would be read in
                  the browser's timezone and can land on the day either side. */}
              {event.date ? format(parseISO(event.date), 'EEE, MMM d') : ''} · {event.start_time} – {event.end_time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {event.site_name}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-gray-400" />
              {event.instructor_name ?? 'Unassigned'}
            </span>
          </div>
        </div>
        <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-full shrink-0">
          Pending
        </span>
      </div>

      {/* Count input — starts empty, and Save stays off until a number is in,
          so a stray click cannot record a class as having had nobody in it. */}
      <label
        htmlFor={`attendance-count-${record.event}`}
        className="block text-xs font-medium text-gray-500 mb-2"
      >
        How many attendees?
      </label>
      <input
        id={`attendance-count-${record.event}`}
        type="number"
        min="0"
        max="999"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="0"
        className="w-24 text-center text-2xl font-bold text-gray-900 rounded-lg border-2 border-gray-200 py-2 mb-3 focus:outline-none focus:border-cyan-500 transition-colors"
      />

      {/* Quick picks */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_PICKS.map((value) => (
          <button
            key={value}
            onClick={() => onInputChange(String(value))}
            className={[
              'w-10 h-10 rounded-lg text-sm font-medium border transition-colors',
              inputValue === String(value)
                ? 'bg-cyan-500 text-white border-cyan-500'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
            ].join(' ')}
          >
            {value}
          </button>
        ))}
      </div>

      <button
        onClick={onSubmit}
        disabled={inputValue === '' || isSaving}
        className="w-full flex items-center justify-center gap-2 bg-cyan-500 text-white font-medium rounded-lg py-2.5 hover:bg-cyan-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSaving ? (
          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Save Attendance
      </button>
    </div>
  )
}
