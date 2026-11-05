import React from 'react'
import { useGymLocaleQuery } from '../../hooks/useGymTimezone'

/**
 * Pages work out "today" and "this week" when they first render, so they wait
 * for the gym's timezone rather than start on the browser's and jump.
 * A failed request falls through to the browser's zone instead of blocking.
 */
export function GymTimezoneGate({ children }: { children: React.ReactNode }) {
  const { isPending, isError } = useGymLocaleQuery()
  if (isPending && !isError) {
    return (
      <div className="flex h-full items-center justify-center" aria-label="Loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }
  return <>{children}</>
}
