import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Paperclip, X } from 'lucide-react'
import { listFacilitiesPeople } from '../../api/facilities'
import { Select } from '../../components/ui/Select'

/** Who looks after a licence or subscription; they get its reminders too. */
export function PersonSelect({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { data: people = [] } = useQuery({ queryKey: ['facilities', 'people'], queryFn: listFacilitiesPeople })
  return (
    <Select
      label="Responsible person"
      value={value ? String(value) : ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      placeholder="Nobody in particular"
      options={people.map((p) => ({ value: String(p.id), label: p.name }))}
    />
  )
}

function dayLabel(d: number) {
  if (d === 0) return 'On the day'
  return d === 1 ? '1 day before' : `${d} days before`
}

/**
 * The days before a date to send a reminder, chosen per record. Shown as
 * chips: remove one with its ×, add one by typing a number.
 */
export function ReminderDaysInput({
  value,
  onChange,
  label = 'Reminders',
  hint,
}: {
  value: number[]
  onChange: (days: number[]) => void
  label?: string
  hint?: string
}) {
  const [draft, setDraft] = useState('')
  const n = Number(draft)
  const valid = draft !== '' && Number.isInteger(n) && n >= 0 && n <= 365 && !value.includes(n)

  const add = () => {
    if (!valid) return
    onChange([...value, n].sort((a, b) => b - a))
    setDraft('')
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700">{label}</legend>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-1">
        {value.length === 0 && <span className="text-sm text-gray-500">No reminders</span>}
        {value.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-800 px-2.5 py-1 text-xs">
            {dayLabel(d)}
            <button
              type="button"
              aria-label={`Remove reminder ${dayLabel(d)}`}
              onClick={() => onChange(value.filter((v) => v !== d))}
              className="hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            aria-label="Add a reminder (days before)"
            type="number"
            min={0}
            max={365}
            placeholder="Days"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={!valid}
            className="text-sm text-cyan-700 disabled:text-gray-300"
          >
            Add
          </button>
        </span>
      </div>
    </fieldset>
  )
}

/**
 * The attached document: a link to the saved one with Remove, or a file
 * picker. A picked file uploads when the record is saved.
 */
export function DocumentField({
  url,
  name,
  picked,
  onPick,
  onRemove,
}: {
  url: string | null
  name: string
  picked: File | null
  onPick: (file: File | null) => void
  onRemove?: () => void
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1">Document</p>
      {url && !picked ? (
        <div className="flex items-center gap-3 text-sm">
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-cyan-700 underline">
            <FileText className="h-4 w-4" />
            {name || 'View document'}
          </a>
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
              Remove
            </button>
          )}
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 text-sm text-cyan-700 cursor-pointer">
          <Paperclip className="h-4 w-4" />
          {picked ? picked.name : 'Attach a PDF or photo'}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            aria-label="Attach document"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  )
}
