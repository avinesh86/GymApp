import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { listClassTypes, updateClassType } from '../../../api/timetable'
import type { ClassType } from '../../../types'
import { Button } from '../../../components/ui/Button'
import { PageSpinner } from '../../../components/ui/Spinner'

function ViabilityRow({ classType }: { classType: ClassType }) {
  const queryClient = useQueryClient()
  const [red, setRed] = useState(classType.viability_red)
  const [amber, setAmber] = useState(classType.viability_amber)
  const [green, setGreen] = useState(classType.viability_green)
  const [purple, setPurple] = useState(classType.viability_purple)

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateClassType(classType.id, {
        viability_red: red,
        viability_amber: amber,
        viability_green: green,
        viability_purple: purple,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-types'] })
      toast.success(`Thresholds saved for ${classType.name}`)
    },
    onError: () => toast.error('Failed to save thresholds'),
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{classType.name}</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <ThresholdInput label="Red (below)" value={red} onChange={setRed} color="red" />
        <ThresholdInput label="Amber (below)" value={amber} onChange={setAmber} color="amber" />
        <ThresholdInput label="Green (below)" value={green} onChange={setGreen} color="green" />
        <ThresholdInput label="Purple (above)" value={purple} onChange={setPurple} color="purple" />
      </div>

      {/* Preview bar */}
      <div className="flex rounded-full overflow-hidden h-2 mb-3">
        <div className="bg-red-400"    style={{ flex: red }} />
        <div className="bg-yellow-400" style={{ flex: amber - red }} />
        <div className="bg-green-400"  style={{ flex: green - amber }} />
        <div className="bg-purple-400" style={{ flex: Math.max(0, purple - green) }} />
      </div>

      <Button size="sm" variant="secondary" onClick={() => save()} isLoading={isPending}>
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
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={[
          'w-full rounded-lg border px-2 py-1.5 text-sm text-gray-900 text-center',
          'focus:outline-none focus:ring-2 focus:border-transparent',
          borderColors[color] ?? 'border-gray-300',
        ].join(' ')}
      />
    </div>
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
      {classTypes.map((ct) => (
        <ViabilityRow key={ct.id} classType={ct} />
      ))}
      {classTypes.length === 0 && (
        <p className="text-sm text-gray-400">No class types configured</p>
      )}
    </div>
  )
}
