import { useQuery } from '@tanstack/react-query'
import { getGymLocale } from '../api/settings'
import { useAuthStore } from '../store/auth'
import { useGymTimezoneStore } from '../store/gymTimezone'
import { safeTimeZone } from '../lib/gymTime'

export const GYM_LOCALE_QUERY_KEY = ['tenant', 'locale'] as const

/**
 * Loads the gym's timezone (GymTimezoneGate runs this once for the whole app).
 * The store is filled inside the query function, so it is set before any
 * page under the gate first renders.
 */
export function useGymLocaleQuery() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: GYM_LOCALE_QUERY_KEY,
    queryFn: async () => {
      const locale = await getGymLocale()
      useGymTimezoneStore.getState().setTimeZone(locale.timezone)
      return locale
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  })
}

/**
 * The gym's timezone (from Settings) — the zone every date, time, "today" and
 * "this week" on the site is shown in. Until it has loaded (or if it can't),
 * this is the browser's zone.
 */
export function useGymTimezone(): string {
  return safeTimeZone(useGymTimezoneStore((s) => s.timeZone))
}
