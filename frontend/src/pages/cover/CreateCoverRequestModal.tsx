import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createCoverRequest } from '../../api/cover'
import { listEventsPaginated } from '../../api/timetable'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { format, addDays } from 'date-fns'

interface CreateCoverRequestModalProps {
  isOpen: boolean
  onClose: () => void
}

type Mode = 'single' | 'absence'

export function CreateCoverRequestModal({ isOpen, onClose }: CreateCoverRequestModalProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('single')

  // Single-class mode.
  const [eventId, setEventId] = useState('')
  const [urgency, setUrgency] = useState('high')
  const [bonusAmount, setBonusAmount] = useState('')
  const [notes, setNotes] = useState('')

  // Prolonged-absence mode.
  const today = format(new Date(), 'yyyy-MM-dd')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data: eventsPage } = useQuery({
    queryKey: ['timetable-events', 'upcoming'],
    queryFn: () => listEventsPaginated({ from: today, status: 'scheduled', page_size: 50 }),
    enabled: isOpen && mode === 'single',
  })

  const { data: rangePage } = useQuery({
    queryKey: ['timetable-events', 'absence-range', fromDate, toDate],
    queryFn: () => listEventsPaginated({ from: fromDate, to: toDate, status: 'scheduled', page_size: 100 }),
    enabled: isOpen && mode === 'absence' && !!fromDate && !!toDate,
  })

  const events = eventsPage?.results ?? []
  const rangeEvents = rangePage?.results ?? []

  function resetForm() {
    setEventId('')
    setUrgency('high')
    setBonusAmount('')
    setNotes('')
    setReason('')
    setSelectedIds(new Set())
    setMode('single')
  }

  const { mutate: createSingle, isPending: isCreatingSingle } = useMutation({
    mutationFn: () =>
      createCoverRequest({
        timetable_event: Number(eventId),
        urgency,
        bonus_amount: bonusAmount || undefined,
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      toast.success('Cover request created')
      onClose()
      resetForm()
    },
    onError: () => toast.error('Failed to create cover request'),
  })

  const { mutate: createBatch, isPending: isCreatingBatch } = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds]
      const results = await Promise.allSettled(
        ids.map((id) => createCoverRequest({ timetable_event: id, notes: reason }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      return { total: ids.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      if (failed > 0) {
        toast(`${total - failed}/${total} cover requests created`, { icon: '⚠️' })
      } else {
        toast.success(`${total} cover request${total !== 1 ? 's' : ''} created`)
      }
      onClose()
      resetForm()
    },
    onError: () => toast.error('Failed to create cover requests'),
  })

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === rangeEvents.length ? new Set() : new Set(rangeEvents.map((e) => e.id))
    )
  }

  const tabClass = (active: boolean) =>
    [
      'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
      active ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
    ].join(' ')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Cover Request"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {mode === 'single' ? (
            <Button onClick={() => createSingle()} isLoading={isCreatingSingle} disabled={!eventId}>
              Create Request
            </Button>
          ) : (
            <Button onClick={() => createBatch()} isLoading={isCreatingBatch} disabled={selectedIds.size === 0}>
              Create {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Request{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Mode switch */}
        <div className="flex gap-2">
          <button type="button" className={tabClass(mode === 'single')} onClick={() => setMode('single')}>
            Single class
          </button>
          <button type="button" className={tabClass(mode === 'absence')} onClick={() => setMode('absence')}>
            Prolonged absence
          </button>
        </div>

        {mode === 'single' ? (
          <>
            <Select
              label="Class"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              options={events.map((ev) => ({
                value: ev.id,
                label: `${format(new Date(ev.date), 'd MMM')} – ${ev.class_type_name} (${ev.start_time})`,
              }))}
              placeholder="Select class"
              required
            />

            <Select
              label="Urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
              ]}
            />

            <Input
              label="Bonus Amount ($, optional)"
              type="number"
              min="0"
              step="0.01"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(e.target.value)}
              placeholder="0.00"
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Additional context for cover instructors..."
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>

            <Input
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Annual leave, illness..."
            />

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Classes in range ({rangeEvents.length})
                </label>
                {rangeEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
                  >
                    {selectedIds.size === rangeEvents.length ? 'Clear all' : 'Select all'}
                  </button>
                )}
              </div>

              {rangeEvents.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No scheduled classes in this range</p>
              ) : (
                <div className="max-h-60 overflow-y-auto flex flex-col gap-1 border border-gray-100 rounded-lg p-2">
                  {rangeEvents.map((ev) => (
                    <label key={ev.id} className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer px-1 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ev.id)}
                        onChange={() => toggleId(ev.id)}
                        className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
                      />
                      {format(new Date(ev.date), 'EEE d MMM')} · {ev.class_type_name} ({ev.start_time})
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
