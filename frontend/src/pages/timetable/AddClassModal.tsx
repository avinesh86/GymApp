import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createEvent, listClassTypes } from '../../api/timetable'
import { listStaff } from '../../api/staff'
import { listSites } from '../../api/settings'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

// ─── Day of week checkboxes for recurring ────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

interface AddClassModalProps {
  isOpen: boolean
  onClose: () => void
  defaultDate?: string
}

export function AddClassModal({ isOpen, onClose, defaultDate }: AddClassModalProps) {
  const queryClient = useQueryClient()

  const [classTypeId, setClassTypeId] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [capacity, setCapacity] = useState('20')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringDays, setRecurringDays] = useState<number[]>([])
  const [recurringEndDate, setRecurringEndDate] = useState('')

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  const { data: staffPage } = useQuery({
    queryKey: ['staff', { status: 'active' }],
    queryFn: () => listStaff({ status: 'active' }),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: listSites,
  })

  const { mutate: createClass, isPending } = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-events'] })
      toast.success('Class added to timetable')
      onClose()
      resetForm()
    },
    onError: () => toast.error('Failed to add class'),
  })

  function resetForm() {
    setClassTypeId('')
    setInstructorId('')
    setSiteId('')
    setDate(defaultDate ?? new Date().toISOString().split('T')[0])
    setStartTime('09:00')
    setEndTime('10:00')
    setCapacity('20')
    setNotes('')
    setIsRecurring(false)
    setRecurringDays([])
    setRecurringEndDate('')
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    createClass({
      class_type: Number(classTypeId),
      instructor: instructorId ? Number(instructorId) : null,
      site: Number(siteId),
      start_datetime: `${date}T${startTime}:00`,
      end_datetime: `${date}T${endTime}:00`,
      capacity: Number(capacity),
      notes,
    })
  }

  function toggleRecurringDay(day: number) {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const staffList = staffPage?.results ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Class"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-class-form" isLoading={isPending}>
            Add Class
          </Button>
        </div>
      }
    >
      <form id="add-class-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Class Type"
          value={classTypeId}
          onChange={(e) => setClassTypeId(e.target.value)}
          options={classTypes.map((ct) => ({ value: ct.id, label: ct.name }))}
          placeholder="Select class type"
          required
        />

        <Select
          label="Instructor"
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          options={staffList.map((s) => ({
            value: s.id,
            label: `${s.first_name} ${s.last_name}`,
          }))}
          placeholder="Select instructor (optional)"
        />

        <Select
          label="Location"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          options={sites.map((site) => ({ value: site.id, label: site.name }))}
          placeholder="Select location"
          required
        />

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            label="End Time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>

        <Input
          label="Capacity"
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            placeholder="Any additional notes..."
          />
        </div>

        {/* Recurring toggle */}
        <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
            />
            <span className="text-sm font-medium text-gray-700">Recurring class</span>
          </label>

          {isRecurring && (
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-2">Repeat on</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleRecurringDay(day.value)}
                      className={[
                        'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                        recurringDays.includes(day.value)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="End Date"
                type="date"
                value={recurringEndDate}
                onChange={(e) => setRecurringEndDate(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                Note: recurring classes will be created individually by the server.
              </p>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
