import React, { useEffect, useState } from 'react'
import type { SeriesScope } from '../../api/timetable'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

/** 'this' = just the class that was opened; the rest act on the series. */
export type ChangeScope = 'this' | SeriesScope

const OPTIONS: { value: ChangeScope; label: string; hint: string }[] = [
  { value: 'this',      label: 'This class only',                 hint: 'Other classes in the series stay as they are.' },
  { value: 'following', label: 'This and following classes',      hint: 'Earlier classes in the series are left alone.' },
  { value: 'all',       label: 'All classes in the series',       hint: 'Every class in the series, past and future.' },
]

interface SeriesScopeDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (scope: ChangeScope) => void
  title: string
  confirmLabel: string
  isLoading?: boolean
  variant?: 'danger' | 'primary'
  /** Shown under the options, and series options are disabled, when only
   * the single class can take the change (e.g. it was moved to another day). */
  seriesDisabledReason?: string
}

/**
 * Asks whether a change to a recurring class applies to just that class or to
 * its series.
 */
export function SeriesScopeDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  isLoading = false,
  variant = 'primary',
  seriesDisabledReason,
}: SeriesScopeDialogProps) {
  const [scope, setScope] = useState<ChangeScope>('this')

  useEffect(() => {
    if (isOpen) setScope('this')
  }, [isOpen])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={() => onConfirm(scope)} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-gray-600 mb-2">This is a recurring class. Apply to:</legend>
        {OPTIONS.map((option) => {
          const disabled = option.value !== 'this' && !!seriesDisabledReason
          return (
            <label
              key={option.value}
              className={[
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer',
                scope === option.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200',
                disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name="series-scope"
                value={option.value}
                checked={scope === option.value}
                disabled={disabled}
                onChange={() => setScope(option.value)}
                className="mt-0.5 h-4 w-4 text-gray-900 focus:ring-cyan-400"
              />
              <span>
                <span className="block text-sm font-medium text-gray-800">{option.label}</span>
                <span className="block text-xs text-gray-400">{option.hint}</span>
              </span>
            </label>
          )
        })}
        {seriesDisabledReason && (
          <p className="text-xs text-orange-600 mt-1">{seriesDisabledReason}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Classes with attendance already recorded are never changed by a series edit or delete.
        </p>
      </fieldset>
    </Modal>
  )
}
