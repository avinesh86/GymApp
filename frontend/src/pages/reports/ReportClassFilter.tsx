import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ListFilter } from 'lucide-react'
import { getClassTypes, getReportClassFilter, saveReportClassFilter } from '../../api/reports'
import { Button } from '../../components/ui/Button'

/**
 * Tick boxes for which classes the Attendance, Classes and Viability reports
 * include — e.g. untick Virtual classes and Family Swim.
 *
 * The choice is saved for the whole gym and stays until someone changes it,
 * so every manager sees the same numbers. Payroll is never filtered.
 */
export function ReportClassFilter() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Set<number>>(new Set())

  const { data: classTypes = [] } = useQuery({ queryKey: ['report-class-types'], queryFn: getClassTypes })
  const { data: saved } = useQuery({ queryKey: ['report-class-filter'], queryFn: getReportClassFilter })
  const excluded = new Set(saved?.excluded_class_types ?? [])
  const includedCount = classTypes.filter((ct) => !excluded.has(ct.id)).length

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => saveReportClassFilter([...draft]),
    onSuccess: (data) => {
      queryClient.setQueryData(['report-class-filter'], data)
      // Every report built on the filter needs refetching.
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      toast.success('Report classes saved')
      setOpen(false)
    },
    onError: () => toast.error('Failed to save report classes'),
  })

  function openPanel() {
    setDraft(new Set(excluded))
    setOpen(true)
  }

  function toggle(id: number) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const label =
    classTypes.length === 0 || includedCount === classTypes.length
      ? 'All classes'
      : `${includedCount} of ${classTypes.length} classes`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
          excluded.size > 0
            ? 'bg-cyan-50 border-cyan-300 text-cyan-800 hover:bg-cyan-100'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
        ].join(' ')}
      >
        <ListFilter className="h-4 w-4" />
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Classes in reports"
          className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900">Classes in reports</p>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-cyan-700 hover:underline" onClick={() => setDraft(new Set())}>
                All
              </button>
              <button
                type="button"
                className="text-cyan-700 hover:underline"
                onClick={() => setDraft(new Set(classTypes.map((ct) => ct.id)))}
              >
                None
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto flex flex-col gap-1 mb-3">
            {classTypes.map((ct) => (
              <label key={ct.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!draft.has(ct.id)}
                  onChange={() => toggle(ct.id)}
                  className="accent-cyan-500"
                />
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ct.color }} />
                {ct.name}
              </label>
            ))}
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Applies to Attendance, Classes and Viability for every manager, and is remembered until changed.
            Payroll always includes every class.
          </p>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => save()} isLoading={isPending}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
