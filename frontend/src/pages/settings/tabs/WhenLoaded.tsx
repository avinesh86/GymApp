import React from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
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
  what,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'isError' | 'refetch'>
  /** Completes "Couldn't load …", e.g. "the invoice settings". */
  what: string
  children: (data: T) => React.ReactNode
}) {
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <EmptyState
          title={`Couldn't load ${what}`}
          description="Check your connection and try again."
          action={{ label: 'Try again', onClick: () => void query.refetch() }}
        />
      )
    }
    return <PageSpinner />
  }
  return <>{children(query.data)}</>
}
