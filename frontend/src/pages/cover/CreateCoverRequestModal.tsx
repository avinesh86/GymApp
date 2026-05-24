import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createCoverRequest } from '../../api/cover'
import { listEventsPaginated } from '../../api/timetable'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { format } from 'date-fns'

interface CreateCoverRequestModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateCoverRequestModal({ isOpen, onClose }: CreateCoverRequestModalProps) {
  const queryClient = useQueryClient()
  const [eventId, setEventId] = useState('')
  const [urgency, setUrgency] = useState('high')
  const [bonusAmount, setBonusAmount] = useState('')
  const [notes, setNotes] = useState('')

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: eventsPage } = useQuery({
    queryKey: ['timetable-events', 'upcoming'],
    queryFn: () => listEventsPaginated({ from: today, status: 'scheduled', page_size: 50 }),
    enabled: isOpen,
  })

  const { mutate: createRequest, isPending } = useMutation({
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

  function resetForm() {
    setEventId('')
    setUrgency('high')
    setBonusAmount('')
    setNotes('')
  }

  const events = eventsPage?.results ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Cover Request"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createRequest()} isLoading={isPending} disabled={!eventId}>
            Create Request
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
      </div>
    </Modal>
  )
}
