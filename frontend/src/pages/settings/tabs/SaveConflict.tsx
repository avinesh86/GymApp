import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { errorDescription } from './WhenLoaded'

/** One field a settings form saves, and how to show its value to a person. */
export interface ConflictField<T> {
  key: keyof T & string
  label: string
  /** How to show a value in the warning. Defaults to the value itself. */
  show?: (value: unknown) => string
  /** A secret: the warning says it changed, never what it is now. */
  secret?: boolean
}

export interface Conflict<T> {
  /** The settings as they are now. */
  latest: T
  /** The fields someone else changed since the form opened. */
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

function pick<T>(data: Partial<T>, keys: (keyof T)[]): Partial<T> {
  const picked: Partial<T> = {}
  for (const key of keys) picked[key] = data[key]
  return picked
}

export interface GuardedSaveOptions<T> {
  /** The data the form opened with, as the server sent it. */
  data: T
  /** The fields this form saves. */
  fields: ConflictField<T>[]
  queryKey: QueryKey
  queryFn: () => Promise<T>
  /** Sends a save. `expected` holds the values the changed fields had when the form opened. */
  send: (payload: Partial<T> & { expected: Partial<T> }) => Promise<T>
  /** The form's current values, as the server stores them. `undefined` leaves a field as it is. */
  current: () => Partial<T>
  /** Sets form fields, e.g. to someone else's newer values. */
  apply: (values: Partial<T>) => void
  /** Write-only extras sent with every save when present (a newly typed password or token). */
  extra?: () => Record<string, unknown>
  /** Also refreshed after a save. */
  alsoRefresh?: QueryKey[]
  onSaved?: (saved: T) => void
  savedMessage: string
  failedMessage: string
}

/**
 * Saves a settings form without overwriting a change someone else made since
 * it opened.
 *
 * Settings forms keep the values they opened with, so typing isn't wiped when
 * the data refreshes. That means a plain save would write those older values
 * over another admin's newer change. Instead:
 *  - only the fields this person changed are sent;
 *  - Save first fetches the latest settings; if anyone changed this form's
 *    fields meanwhile, nothing is saved and `conflict` lists them;
 *  - the save also carries the values the changed fields opened with, and the
 *    server refuses it (409) if they changed in the moment between the check
 *    and the save, which shows the same warning.
 * From the warning, `loadTheirs` puts their values into the listed fields, and
 * `saveMine` keeps their other changes and saves only this person's.
 */
export function useGuardedSave<T>(options: GuardedSaveOptions<T>) {
  const { data, fields, queryKey, queryFn, send, current, apply, extra, alsoRefresh, onSaved } = options
  const queryClient = useQueryClient()
  const keys = fields.map((f) => f.key)
  // The server's values as this form last knew them. A ref, so the save
  // compares against the latest one, not a value captured by an older render.
  const opened = useRef<Partial<T>>(pick(data, keys))
  const [conflict, setConflict] = useState<Conflict<T> | null>(null)
  const [checking, setChecking] = useState(false)

  const changedBy = (latest: Partial<T>) => fields.filter((f) => !sameValue(latest[f.key], opened.current[f.key]))
  const mine = () => {
    const values = current()
    return keys.filter((key) => values[key] !== undefined && !sameValue(values[key], opened.current[key]))
  }

  const { mutate, isPending } = useMutation({
    mutationKey: queryKey,
    mutationFn: (payload: Partial<T> & { expected: Partial<T> }) => send(payload),
    onSuccess: (saved, sent) => {
      // What the server stored (it may have tidied it), not what was sent;
      // a field it didn't send back keeps the value that was sent.
      const stored = Object.fromEntries(
        keys.filter((key) => key in sent || saved?.[key] !== undefined).map((key) => [
          key,
          saved?.[key] !== undefined ? saved[key] : (sent as Partial<T>)[key],
        ]),
      ) as Partial<T>
      opened.current = { ...opened.current, ...stored }
      if (saved) queryClient.setQueryData(queryKey, saved)
      void queryClient.invalidateQueries({ queryKey })
      for (const key of alsoRefresh ?? []) void queryClient.invalidateQueries({ queryKey: key })
      onSaved?.(saved)
      toast.success(options.savedMessage)
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        // Changed in the moment between the check and the save.
        const latest = error.response.data.current as T
        setConflict({ latest, changed: changedBy(latest) })
        return
      }
      toast.error(options.failedMessage)
    },
  })

  function submit(changedKeys: (keyof T)[]) {
    const values = current()
    mutate({ ...pick(values, changedKeys), ...(extra?.() ?? {}), expected: pick(opened.current, changedKeys) } as never)
  }

  /** Saves this person's changes, unless someone else changed these settings meanwhile. */
  async function save() {
    setConflict(null)
    setChecking(true)
    let latest: T
    try {
      latest = await queryClient.fetchQuery({ queryKey, queryFn, staleTime: 0 })
    } catch (error) {
      setChecking(false)
      const offline = isAxiosError(error) && !error.response
      toast.error(`Couldn't save. ${errorDescription(error, offline)}`)
      return
    }
    const theirs = changedBy(latest)
    if (theirs.length) setConflict({ latest, changed: theirs })
    else submit(mine())
    // Only now, so there's no moment between the check and the save when the
    // button looks free to press again.
    setChecking(false)
  }

  /** Puts their values into the fields they changed. This person's other edits stay. */
  function loadTheirs() {
    if (!conflict) return
    apply(pick(conflict.latest, conflict.changed.map((f) => f.key)))
    opened.current = pick(conflict.latest, keys)
    setConflict(null)
  }

  /** Keeps their changes to fields this person didn't touch; saves this person's. */
  function saveMine() {
    if (!conflict) return
    const myKeys = mine()
    const theirsOnly = conflict.changed.map((f) => f.key).filter((key) => !myKeys.includes(key))
    apply(pick(conflict.latest, theirsOnly))
    opened.current = pick(conflict.latest, keys)
    setConflict(null)
    // Against their values now, so yet another change is caught too.
    submit(myKeys)
  }

  return { save, loadTheirs, saveMine, conflict, isSaving: isPending || checking }
}

/** The warning shown when Save finds the settings changed underneath. */
export function SaveConflictWarning<T>({
  conflict,
  onLoadTheirs,
  onSaveMine,
}: {
  conflict: Conflict<T> | null
  onLoadTheirs: () => void
  onSaveMine: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Save sits at the bottom of long forms: bring the warning into view and
  // give it focus, so it's seen (and read out) rather than pushed off screen.
  useEffect(() => {
    if (!conflict) return
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    ref.current?.focus()
  }, [conflict])
  if (!conflict) return null
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Someone else changed these settings since you opened this page. Nothing has been saved yet.
      </p>
      <ul className="mt-2 ml-6 list-disc space-y-0.5">
        {conflict.changed.map((f) => (
          <li key={f.key}>
            {f.label}{' '}
            {f.secret ? (
              '(changed)'
            ) : (
              <span className="whitespace-nowrap">(now: {(f.show ?? defaultShow)(conflict.latest[f.key])})</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        <strong>Use their values</strong> puts their values into the fields above; anything else you&apos;ve entered
        stays. <strong>Save my changes</strong> saves only the fields you changed and keeps the rest of theirs.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onLoadTheirs}>Use their values</Button>
        <Button variant="secondary" onClick={onSaveMine}>
          Save my changes
        </Button>
      </div>
    </div>
  )
}
