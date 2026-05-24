import { useQuery } from '@tanstack/react-query'
import { getTenantBranding, getTenantSettings } from '../api/settings'
import { useAuthStore } from '../store/auth'

export function useTenantBranding() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['tenant', 'branding'],
    queryFn: getTenantBranding,
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  })
}

export function useTenantSettings() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['tenant', 'settings'],
    queryFn: getTenantSettings,
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  })
}
