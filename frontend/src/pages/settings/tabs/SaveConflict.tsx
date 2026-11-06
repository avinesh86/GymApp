import React, { useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/Button'

/** One field a settings form saves, and how to show its value to a person. */
export interface ConflictField<T> {
  key: keyof T & string
  label: string
  /** How to show a value in the warning. Defaults to the value itself. */
  show?: (value: unknown) => string
}

export interface Conflict<T> {
  latest: T
  changed: ConflictField<T>[]
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function defaultShow(value: unknown) {
  if (value === null || value === undefined || value === '') return '(blank)'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)'
  return String(value)
}

function pick<T>(data: T, fields: ConflictField<T>[]): Partial<T> {
  const picked: Partial<T> = {}
  for (const f of fields) picked[f.key] = data[f.key]
  return picked
}

/**
 * Stops a settings form saving over a change someone else made since it opened.
 *
 * Settings forms keep the values they opened with, so typing isn't wiped when
 * the data refreshes. Without this check, Save would then quietly write those
 * older values back over another admin's newer change. Before saving, it
 * fetches the latest settings and compares this form's fields with how they
 * were when the form opened. If any changed, the save waits and `conflict`
 * says which, so the person can load the new values or save theirs anyway.
 */
export function useSaveConflictCheck<T>({
  data,
  queryKey,
  queryFn,
  fields,
}: {
  /** The data the form opened with. */
  data: T
  queryKey: QueryKey
  queryFn: () => Promise<T>
  fields: ConflictField<T>[]
}) {
  const queryClient = useQueryClient()
  const [opened, setOpened] = useState(() => pick(data, fields))
  const [conflict, setConflict] = useState<Conflict<T> | null>(null)
  const [checking, setChecking] = useState(false)

  /** Runs `save` unless the settings changed underneath this form. */
  async function saveIfUnchanged(save: () => void) {
    setChecking(true)
    let latest: T
    try {
      latest = await queryClient.fetchQuery({ queryKey, queryFn, staleTime: 0 })
    } catch {
      toast.error("Couldn't save: check your connection and try again")
      return
    } finally {
      setChecking(false)
    }
    const changed = fields.filter((f) => !sameValue(opened[f.key], latest[f.key]))
    if (changed.length) setConflict({ latest, changed })
    else save()
  }

  /** Saves this form's values even though someone else changed them. */
  function saveAnyway(save: () => void) {
    setConflict(null)
    save()
  }

  /** After a save: what's on the server now is what this form saved. */
  function markSaved(saved: Partial<T>) {
    setOpened((was) => ({ ...was, ...saved }))
  }

  return { saveIfUnchanged, saveAnyway, markSaved, conflict, checking }
}

/** The warning shown when Save finds the settings changed underneath. */
export function SaveConflictWarning<T>({
  conflict,
  onLoadTheirs,
  onSaveMine,
}: {
  conflict: Conflict<T>
  onLoadTheirs: () => void
  onSaveMine: () => void
}) {
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        These settings were changed by someone else since you opened this page:
      </p>
      <ul className="mt-2 ml-6 list-disc space-y-0.5">
        {conflict.changed.map((f) => (
          <li key={f.key}>
            {f.label} (now: {(f.show ?? defaultShow)(conflict.latest[f.key])})
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLoadTheirs}>
          Load their changes
        </Button>
        <Button onClick={onSaveMine}>Save mine anyway</Button>
      </div>
    </div>
  )
}
