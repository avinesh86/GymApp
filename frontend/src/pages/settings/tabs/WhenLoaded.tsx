import React, { useRef } from 'react'
import { isAxiosError } from 'axios'
import { useIsMutating, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { EmptyState } from '../../../components/ui/EmptyState'
import { PageSpinner } from '../../../components/ui/Spinner'

/**
 * Shows a spinner while `query` loads, a "Couldn't load … / Try again"
 * message if it fails, and `children(data)` once the data is here.
 *
 * Settings forms render inside this so they only exist once the gym's real
 * settings do: their fields start from the saved values, there are never
 * placeholder defaults on screen to read or to save over the real settings,
 * and a background refetch doesn't reset edits the person hasn't saved.
 */
export function WhenLoaded<T>({
  query,
  savesKey,
  what,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isError' | 'isStale' | 'isFetchedAfterMount' | 'refetch'>
  /** The `mutationKey` every save of this data carries. */
  savesKey: QueryKey
  /** Completes "Couldn't load …", e.g. "the invoice settings". */
  what: string
  children: (data: T) => React.ReactNode
}) {
  const { data, error, isError, isStale, isFetchedAfterMount, refetch } = query
  // A save still running when the form would first appear (the person left
  // the tab mid-save and came back) means the cached copy is about to be
  // replaced: wait for it. Once the form is showing it stays, so a save from
  // the form itself never resets it.
  const saving = useIsMutating({ mutationKey: savesKey }) > 0
  const formShown = useRef(false)

  if (data === undefined && isError) {
    const status = isAxiosError(error) ? error.response?.status : undefined
    const forbidden = status === 403
    return (
      <EmptyState
        title={`Couldn't load ${what}`}
        description={
          forbidden
            ? "Your role doesn't have access to these settings. Ask the gym's owner."
            : status === undefined
              ? 'Check your connection and try again.'
              : 'Something went wrong on our end. Try again, and tell us if it keeps happening.'
        }
        action={forbidden ? undefined : { label: 'Try again', onClick: () => void refetch() }}
      />
    )
  }
  const waiting =
    data === undefined ||
    // An out-of-date cached copy would seed the form with old values, and
    // Save would then undo someone else's change: wait for the fresh one.
    (isStale && !isFetchedAfterMount && !isError) ||
    (saving && !formShown.current)
  if (waiting) return <PageSpinner />
  formShown.current = true
  return <>{children(data)}</>
}
