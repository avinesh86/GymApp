import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfWeek, format, parseISO, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns'
import { Download, Mail, Pause, Pencil, Play, Plus, Send, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import {
  createReportSchedule,
  deleteReportSchedule,
  exportReport,
  listReportSchedules,
  sendReportScheduleNow,
  updateReportSchedule,
} from '../../api/reports'
import type { ReportFrequency, ReportSchedule, ReportScheduleInput, ReportSection } from '../../types'

export const SECTION_OPTIONS: Array<{ key: ReportSection; label: string; hint: string }> = [
  { key: 'summary', label: 'Summary', hint: 'Headline numbers' },
  { key: 'attendance', label: 'Attendance', hint: 'Attendance chart, time of day, class list' },
  { key: 'classes', label: 'Classes', hint: 'Attendance by class and day of week' },
  { key: 'instructors', label: 'Instructors', hint: 'Classes taught, attendance, reliability' },
  { key: 'viability', label: 'Viability', hint: 'Viability by class' },
  { key: 'financial', label: 'Financial', hint: 'Payroll by instructor' },
]
const ALL_SECTIONS = SECTION_OPTIONS.map((s) => s.key)

const FREQUENCIES: Array<{ key: ReportFrequency; label: string }> = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

const WHEN_SENT: Record<ReportFrequency, string> = {
  daily: 'every day, for the day before',
  weekly: 'every Monday, for the week before',
  monthly: 'on the 1st of each month, for the month before',
}

/** "07:30" → "7:30am". */
function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** The most recent finished period's anchor date, as the date input wants it. */
function defaultDate(frequency: ReportFrequency): string {
  const today = new Date()
  if (frequency === 'daily') return iso(subDays(today, 1))
  if (frequency === 'weekly') return iso(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }))
  return format(subMonths(today, 1), 'yyyy-MM')
}

function periodLabel(frequency: ReportFrequency, value: string): string {
  if (!value) return ''
  if (frequency === 'monthly') return format(parseISO(`${value}-01`), 'MMMM yyyy')
  const day = parseISO(value)
  if (frequency === 'daily') return format(day, 'EEE d MMM yyyy')
  const start = startOfWeek(day, { weekStartsOn: 1 })
  return `${format(start, 'EEE d MMM')} – ${format(endOfWeek(day, { weekStartsOn: 1 }), 'EEE d MMM yyyy')}`
}

function errorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const first = Object.entries(detail as Record<string, unknown>)[0]
    if (first) {
      const [field, value] = first
      const flat = JSON.stringify(value).replace(/[[\]{}"]|\d+:/g, ' ').replace(/\s+/g, ' ').trim()
      return `${field.replace(/_/g, ' ')}: ${flat}`
    }
  }
  return fallback
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function FrequencyPicker({ value, onChange }: { value: ReportFrequency; onChange: (f: ReportFrequency) => void }) {
  return (
    <div role="radiogroup" aria-label="Report type" className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
      {FREQUENCIES.map((f) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={value === f.key}
          onClick={() => onChange(f.key)}
          className={[
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === f.key ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

function SectionChecklist({ value, onChange }: { value: ReportSection[]; onChange: (s: ReportSection[]) => void }) {
  const toggle = (key: ReportSection) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : ALL_SECTIONS.filter((k) => k === key || value.includes(k)))
  const allChosen = value.length === ALL_SECTIONS.length
  return (
    <fieldset>
      <div className="flex items-center justify-between mb-2">
        <legend className="text-sm font-medium text-gray-700">Include in the report</legend>
        <button
          type="button"
          onClick={() => onChange(allChosen ? [] : ALL_SECTIONS)}
          className="text-xs font-medium text-cyan-600 hover:text-cyan-700"
        >
          {allChosen ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SECTION_OPTIONS.map((s) => (
          <label
            key={s.key}
            className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              checked={value.includes(s.key)}
              onChange={() => toggle(s.key)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">{s.label}</span>
              <span className="block text-xs text-gray-500">{s.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// ─── Download tab ────────────────────────────────────────────────────────────

function DownloadTab() {
  const [frequency, setFrequency] = useState<ReportFrequency>('weekly')
  const [dateValue, setDateValue] = useState(defaultDate('weekly'))
  const [sections, setSections] = useState<ReportSection[]>(ALL_SECTIONS)

  function changeFrequency(f: ReportFrequency) {
    setFrequency(f)
    setDateValue(defaultDate(f))
  }

  const { mutate: download, isPending } = useMutation({
    mutationFn: () =>
      exportReport({
        frequency,
        date: frequency === 'monthly' ? `${dateValue}-01` : dateValue,
        sections,
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${frequency}-report-${
        frequency === 'weekly' ? iso(startOfWeek(parseISO(dateValue), { weekStartsOn: 1 })) : dateValue
      }.pdf`
      // Firefox only follows the click for an anchor that is in the document,
      // and revoking the URL before the download starts aborts it.
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Failed to create the report'),
  })

  return (
    <div className="flex flex-col gap-5">
      <FrequencyPicker value={frequency} onChange={changeFrequency} />

      <div className="flex flex-col gap-1">
        <label htmlFor="export-period" className="text-sm font-medium text-gray-700">
          {frequency === 'daily' ? 'Day' : frequency === 'weekly' ? 'Any day in the week' : 'Month'}
        </label>
        <input
          id="export-period"
          type={frequency === 'monthly' ? 'month' : 'date'}
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
          className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        {dateValue && <p className="text-xs text-gray-500">Report covers {periodLabel(frequency, dateValue)}</p>}
      </div>

      <SectionChecklist value={sections} onChange={setSections} />

      <div className="flex justify-end">
        <Button
          leftIcon={<Download className="h-4 w-4" />}
          isLoading={isPending}
          disabled={!dateValue || sections.length === 0}
          onClick={() => download()}
        >
          Download PDF
        </Button>
      </div>
    </div>
  )
}

// ─── Schedules tab ───────────────────────────────────────────────────────────

const EMPTY_SCHEDULE: ReportScheduleInput = {
  name: '',
  frequency: 'weekly',
  send_time: '07:00',
  sections: ALL_SECTIONS,
  recipients: [],
}

function parseRecipients(text: string): string[] {
  return text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)
}

function ScheduleForm({
  initial,
  onDone,
  editingId,
}: {
  initial: ReportScheduleInput
  onDone: () => void
  editingId?: number
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ReportScheduleInput>(initial)
  const [recipientsText, setRecipientsText] = useState(initial.recipients.join(', '))

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const data = { ...form, recipients: parseRecipients(recipientsText) }
      return editingId ? updateReportSchedule(editingId, data) : createReportSchedule(data)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['report-schedules'] })
      toast.success(editingId ? 'Schedule updated' : 'Schedule created')
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to save the schedule')),
  })

  const canSave =
    form.name.trim() && form.send_time && form.sections.length > 0 && parseRecipients(recipientsText).length > 0

  return (
    <form
      aria-label={editingId ? 'Edit schedule' : 'New schedule'}
      className="flex flex-col gap-4 rounded-lg border border-cyan-200 bg-cyan-50/40 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) save()
      }}
    >
      <Input
        label="Schedule name"
        id="schedule-name"
        placeholder="e.g. Weekly summary for the owners"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">How often</span>
        <FrequencyPicker value={form.frequency} onChange={(frequency) => setForm({ ...form, frequency })} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="schedule-send-time" className="text-sm font-medium text-gray-700">
          Send at
        </label>
        <input
          id="schedule-send-time"
          type="time"
          step={900}
          required
          value={form.send_time}
          onChange={(e) => setForm({ ...form, send_time: e.target.value })}
          className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        {form.send_time && (
          <p className="text-xs text-gray-500">
            Emailed at {clockLabel(form.send_time)} gym time {WHEN_SENT[form.frequency]}.
          </p>
        )}
      </div>
      <SectionChecklist value={form.sections} onChange={(sections) => setForm({ ...form, sections })} />
      <div className="flex flex-col gap-1">
        <label htmlFor="schedule-recipients" className="text-sm font-medium text-gray-700">
          Email to
        </label>
        <textarea
          id="schedule-recipients"
          rows={2}
          placeholder="owner@yourgym.com, manager@yourgym.com"
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <p className="text-xs text-gray-500">Separate addresses with commas. Anyone can receive it — they don't need a FitOps login.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending} disabled={!canSave}>
          {editingId ? 'Save Schedule' : 'Create Schedule'}
        </Button>
      </div>
    </form>
  )
}

function ScheduleRow({ schedule, onEdit }: { schedule: ReportSchedule; onEdit: () => void }) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['report-schedules'] })

  const toggle = useMutation({
    mutationFn: () => updateReportSchedule(schedule.id, { is_active: !schedule.is_active }),
    onSuccess: async () => {
      await refresh()
      toast.success(schedule.is_active ? 'Schedule paused' : 'Schedule resumed')
    },
    onError: () => toast.error('Failed to update the schedule'),
  })
  const sendNow = useMutation({
    mutationFn: () => sendReportScheduleNow(schedule.id),
    onSuccess: (data) => toast.success(data.detail),
    onError: (error) => toast.error(errorMessage(error, 'Failed to send the report')),
  })
  const remove = useMutation({
    mutationFn: () => deleteReportSchedule(schedule.id),
    onSuccess: async () => {
      setConfirmDelete(false)
      await refresh()
      toast.success('Schedule deleted')
    },
    onError: () => toast.error('Failed to delete the schedule'),
  })

  const sectionNames = SECTION_OPTIONS.filter((s) => schedule.sections.includes(s.key)).map((s) => s.label)

  return (
    <li className="rounded-lg border border-gray-200 p-3" data-testid="report-schedule">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">
            {schedule.name}
            {!schedule.is_active && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Paused</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {FREQUENCIES.find((f) => f.key === schedule.frequency)?.label} at {clockLabel(schedule.send_time)} ·{' '}
            {sectionNames.join(', ')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 break-all">To {schedule.recipients.join(', ')}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {schedule.last_sent_at
              ? `Last sent ${format(parseISO(schedule.last_sent_at), 'd MMM yyyy, h:mma')}`
              : 'Not sent yet'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label={`Send ${schedule.name} now`} title="Send now" isLoading={sendNow.isPending} onClick={() => sendNow.mutate()}>
            <Send className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`${schedule.is_active ? 'Pause' : 'Resume'} ${schedule.name}`} title={schedule.is_active ? 'Pause' : 'Resume'} isLoading={toggle.isPending} onClick={() => toggle.mutate()}>
            {schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Edit ${schedule.name}`} title="Edit" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Delete ${schedule.name}`} title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        title="Delete schedule"
        message={`Stop emailing "${schedule.name}" and delete it?`}
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
    </li>
  )
}

function SchedulesTab() {
  const [editing, setEditing] = useState<ReportSchedule | 'new' | null>(null)
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: listReportSchedules,
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Email a report automatically after each day, week or month. It includes what you can see on the Reports page.
      </p>

      {editing === 'new' && <ScheduleForm initial={EMPTY_SCHEDULE} onDone={() => setEditing(null)} />}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading schedules…</p>
      ) : schedules.length === 0 && editing !== 'new' ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
          <Mail className="mx-auto h-6 w-6 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">No scheduled reports yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedules.map((s) =>
            editing !== 'new' && editing?.id === s.id ? (
              <ScheduleForm
                key={s.id}
                editingId={s.id}
                initial={{
                  name: s.name,
                  frequency: s.frequency,
                  send_time: s.send_time,
                  sections: s.sections,
                  recipients: s.recipients,
                }}
                onDone={() => setEditing(null)}
              />
            ) : (
              <ScheduleRow key={s.id} schedule={s} onEdit={() => setEditing(s)} />
            ),
          )}
        </ul>
      )}

      {editing === null && (
        <div>
          <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New Schedule
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

type ExportTab = 'download' | 'schedules'

export function ExportReportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<ExportTab>('download')
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Report" size="lg">
      <div role="tablist" className="flex gap-1 border-b border-gray-200 mb-5 -mt-1">
        {([
          ['download', 'Download'],
          ['schedules', 'Email schedules'],
        ] as Array<[ExportTab, string]>).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'download' ? <DownloadTab /> : <SchedulesTab />}
    </Modal>
  )
}

