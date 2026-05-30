import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getSetupStatus } from '../api/settings'
import type { SetupStatus } from '../types'

export function useSetupStatus(): SetupStatus & { isLoading: boolean } {
  const { isAuthenticated } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })

  return {
    setup_completed: data?.setup_completed ?? false,
    has_location: data?.has_location ?? false,
    has_class_type: data?.has_class_type ?? false,
    trial_ends_at: data?.trial_ends_at ?? null,
    subscription_status: data?.subscription_status ?? 'trialing',
    isLoading,
  }
}
