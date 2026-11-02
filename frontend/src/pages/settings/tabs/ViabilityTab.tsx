import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { listClassTypes, updateClassType } from '../../../api/timetable'
import type { ClassType } from '../../../types'
import { Button } from '../../../components/ui/Button'
import { PageSpinner } from '../../../components/ui/Spinner'

/** "9–19", "5" or "30+" — the counts a colour covers, or null if none. */
function rangeLabel(from: number, nextStart?: number): string | null {
  if (nextStart === undefined) return `${from}+`
  const to = nextStart - 1
  if (to < from) return null
  return to === from ? `${from}` : `${from}–${to}`
}

/** Why these thresholds can't be saved, or null if they can. */
export function thresholdError(amber: number, green: number, purple: number): string | null {
  if (amber < 1) return 'Amber must start at 1 or more, so a class nobody attends is red.'
  if (green < amber) return 'Green must start at or above where amber starts.'
  if (purple < green) return 'Purple must start at or above where green starts.'
  return null
}

function ViabilityRow({ classType }: { classType: ClassType }) {
  const queryClient = useQueryClient()
  const [amber, setAmber] = useState(classType.amber_threshold)
  const [green, setGreen] = useState(classType.green_threshold)
  const [purple, setPurple] = useState(classType.purple_threshold)

  const error = thresholdError(amber, green, purple)

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateClassType(classType.id, {
        amber_threshold: amber,
        green_threshold: green,
        purple_threshold: purple,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-types'] })
      toast.success(`Thresholds saved for ${classType.name}`)
    },
    onError: () => toast.error('Failed to save thresholds'),
  })

  // Each number is where a colour starts, so the ranges follow from them.
  const bands = [
    { label: 'Red', range: rangeLabel(0, amber), chip: 'bg-red-100 text-red-700', bar: 'bg-red-400', size: amber },
    { label: 'Amber', range: rangeLabel(amber, green), chip: 'bg-yellow-100 text-yellow-800', bar: 'bg-yellow-400', size: green - amber },
    { label: 'Green', range: rangeLabel(green, purple), chip: 'bg-green-100 text-green-700', bar: 'bg-green-400', size: purple - green },
    { label: 'Purple', range: rangeLabel(purple), chip: 'bg-purple-100 text-purple-700', bar: 'bg-purple-400', size: Math.max(2, Math.round(purple / 4)) },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{classType.name}</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <ThresholdInput label="Amber starts at" value={amber} onChange={setAmber} color="amber" />
        <ThresholdInput label="Green starts at" value={green} onChange={setGreen} color="green" />
        <ThresholdInput label="Purple starts at" value={purple} onChange={setPurple} color="purple" />
      </div>

      {/* What each colour covers, in people */}
      <div className="flex flex-wrap gap-2 mb-2" aria-label={`${classType.name} colour ranges`}>
        {bands.map((b) => (
          <span key={b.label} className={`px-2 py-0.5 rounded-md text-xs font-medium ${b.chip}`}>
            {b.label} {b.range ?? 'none'}
          </span>
        ))}
      </div>

      {/* Preview bar */}
      {!error && (
        <div className="flex rounded-full overflow-hidden h-2 mb-3">
          {bands.map((b) => (
            <div key={b.label} className={b.bar} style={{ flex: Math.max(0, b.size) }} />
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-3" role="alert">{error}</p>}

      <Button size="sm" variant="secondary" onClick={() => save()} isLoading={isPending} disabled={!!error}>
        Save Thresholds
      </Button>
    </div>
  )
}

function ThresholdInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: string
}) {
  const borderColors: Record<string, string> = {
    red: 'border-red-300 focus:ring-red-400',
    amber: 'border-yellow-300 focus:ring-yellow-400',
    green: 'border-green-300 focus:ring-green-400',
    purple: 'border-purple-300 focus:ring-purple-400',
  }

  return (
    <label className="block text-xs text-gray-500">
      {label}
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'mt-1 w-full rounded-lg border px-2 py-1.5 text-sm text-gray-900 text-center',
          'focus:outline-none focus:ring-2 focus:border-transparent',
          borderColors[color] ?? 'border-gray-300',
        ].join(' ')}
      />
    </label>
  )
}

export function ViabilityTab() {
  const { data: classTypes = [], isLoading } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Set the attendance at which each colour starts. Anything below Amber is red. These colour
        the timetable once attendance is recorded, and the reports.
      </p>
      {classTypes.map((ct) => (
        <ViabilityRow key={ct.id} classType={ct} />
      ))}
      {classTypes.length === 0 && (
        <p className="text-sm text-gray-400">No class types configured</p>
      )}
    </div>
  )
}
