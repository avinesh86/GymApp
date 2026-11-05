import { useQuery } from '@tanstack/react-query'
import { getFacilitiesConfig } from '../api/facilities'
import { useAuth } from './useAuth'

/** Which parts of Facilities are switched on for this gym, and what this user can do. */
export function useFacilitiesConfig() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['facilities', 'config'],
    queryFn: getFacilitiesConfig,
    enabled: !!user,
    staleTime: 60 * 1000,
  })
}
