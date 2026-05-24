import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useSetupStatus } from '../../hooks/useSetupStatus'
import { useAuth } from '../../hooks/useAuth'

export function SetupBanner() {
  const { setup_completed, trial_ends_at, subscription_status } = useSetupStatus()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = React.useState(false)

  if (dismissed) return null

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin'

  if (!setup_completed && isOwnerOrAdmin) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <strong>Complete your setup</strong> — add a location and class type in{' '}
            <button
              onClick={() => navigate('/settings')}
              className="underline font-semibold hover:text-amber-900"
            >
              Settings
            </button>{' '}
            to unlock all features.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-500 hover:text-amber-700 shrink-0"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (subscription_status === 'trialing' && trial_ends_at) {
    const trialEnd = parseISO(trial_ends_at)
    const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft > 0) {
      return (
        <div className="bg-cyan-50 border-b border-cyan-200 px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-sm text-cyan-800">
            🎉 <strong>{daysLeft} days</strong> left in your free trial — ends{' '}
            {format(trialEnd, 'd MMM yyyy')}.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="text-cyan-500 hover:text-cyan-700 shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )
    }
  }

  return null
}
