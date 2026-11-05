import { create } from 'zustand'

interface GymTimezoneState {
  /** The gym's IANA timezone from Settings; null until it has loaded. */
  timeZone: string | null
  setTimeZone: (timeZone: string | null) => void
}

export const useGymTimezoneStore = create<GymTimezoneState>()((set) => ({
  timeZone: null,
  setTimeZone: (timeZone) => set({ timeZone }),
}))
