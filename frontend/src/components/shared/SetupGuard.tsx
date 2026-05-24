import React from 'react'
import { useSetupStatus } from '../../hooks/useSetupStatus'

interface SetupGuardProps {
  children: React.ReactElement
  /** Custom tooltip message shown when setup is incomplete. */
  message?: string
}

/**
 * Wraps an interactive element and disables it with a tooltip until the tenant
 * has completed minimum setup (at least one active location and one class type).
 */
export function SetupGuard({ children, message }: SetupGuardProps) {
  const { setup_completed, has_location, has_class_type } = useSetupStatus()

  if (setup_completed) return children

  const missing: string[] = []
  if (!has_location) missing.push('a location')
  if (!has_class_type) missing.push('a class type')

  const tooltip = message ?? `Add ${missing.join(' and ')} in Settings to enable this.`

  return (
    <span title={tooltip} className="inline-block cursor-not-allowed">
      {React.cloneElement(children, {
        disabled: true,
        className: `${children.props.className ?? ''} opacity-50 pointer-events-none`,
        onClick: undefined,
      })}
    </span>
  )
}
