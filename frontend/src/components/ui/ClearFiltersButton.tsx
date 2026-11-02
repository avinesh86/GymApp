import { X } from 'lucide-react'

interface ClearFiltersButtonProps {
  /** Whether any filter differs from the page's default. Hidden when not. */
  active: boolean
  onClear: () => void
}

/**
 * Resets a page's filters in one click. Only shown while a filter is set, so
 * it doubles as a cue that the list is filtered.
 */
export function ClearFiltersButton({ active, onClear }: ClearFiltersButtonProps) {
  if (!active) return null

  return (
    <button
      type="button"
      onClick={onClear}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      <X className="h-4 w-4" />
      Clear Filters
    </button>
  )
}
