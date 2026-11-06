import React, { useState } from 'react'
import { isAxiosError } from 'axios'
import { useIsMutating, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { EmptyState } from '../../../components/ui/EmptyState'
import { PageSpinner } from '../../../components/ui/Spinner'

type LoadQuery<T> = Pick<
  UseQueryResult<T>,
  'data' | 'error' | 'isError' | 'isFetching' | 'isStale' | 'isFetchedAfterMount' | 'fetchStatus' | 'refetch'
>

export type LoadState = 'waiting' | 'error' | 'ready'

/**
 * Whether a settings form can be shown yet.
 *
 * The form waits for data that is current: not just any cached copy, but one
 * fetched since the tab opened (or still fresh), with no fetch or save of it
 * still running. A form seeded from an older copy would save that copy back
 * over a newer change.
 *
 * Once the form has been shown it stays: refetches, saves and the data going
 * out of date never swap it for a spinner and lose what the person has typed.
 */
export function useLoadState<T>(query: LoadQuery<T>, savesKey: QueryKey): LoadState {
  const saving = useIsMutating({ mutationKey: savesKey }) > 0
  const [shown, setShown] = useState(false)
  const { data, isError, isFetching, isStale, isFetchedAfterMount, fetchStatus } = query

  let state: LoadState
  if (shown && data !== undefined) state = 'ready'
  else if (isFetching || saving) state = 'waiting'
  // A failed fetch, or a request that can't be sent while offline: don't
  // fall back to an older copy, say so.
  else if (isError || fetchStatus === 'paused') state = 'error'
  else if (data === undefined || (isStale && !isFetchedAfterMount)) state = 'waiting'
  else state = 'ready'

  // React's pattern for remembering something from an earlier render.
  if (state === 'ready' && !shown) setShown(true)
  return state
}

function errorDescription(error: unknown, offline: boolean) {
  if (offline || (isAxiosError(error) && !error.response)) return 'Check your connection and try again.'
  if (isAxiosError(error) && error.response?.status === 403) return "Your account doesn't have access to these settings."
  return 'Something went wrong on our end. Try again, and tell us if it keeps happening.'
}

/**
 * Shows a spinner until `query` has current data (see `useLoadState`), a
 * "Couldn't load … / Try again" message if it can't get it, and then
 * `children(data)`.
 *
 * Settings forms render inside this so their fields start from the gym's
 * real, current settings: there are never placeholder or out-of-date values
 * on screen to read or to save.
 */
export function WhenLoaded<T>({
  query,
  savesKey,
  what,
  children,
}: {
  query: LoadQuery<T>
  /** The `mutationKey` every save of this data carries. */
  savesKey: QueryKey
  /** Completes "Couldn't load …", e.g. "the invoice settings". */
  what: string
  /** `reload` remounts the form from the latest data ("Load their changes"). */
  children: (data: T, reload: () => void) => React.ReactNode
}) {
  const state = useLoadState(query, savesKey)
  const [version, setVersion] = useState(0)
  if (state === 'error') {
    const forbidden = isAxiosError(query.error) && query.error.response?.status === 403
    return (
      <EmptyState
        title={`Couldn't load ${what}`}
        description={errorDescription(query.error, query.fetchStatus === 'paused')}
        action={forbidden ? undefined : { label: 'Try again', onClick: () => void query.refetch() }}
      />
    )
  }
  if (state === 'waiting' || query.data === undefined) return <PageSpinner />
  return <React.Fragment key={version}>{children(query.data, () => setVersion((v) => v + 1))}</React.Fragment>
}
