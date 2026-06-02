import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, TokenPair } from '../types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  /** True while UserInitializer is restoring the access token on a cold reload. */
  isRestoring: boolean
  login: (tokens: TokenPair, user: AuthUser) => void
  logout: () => void
  setAccessToken: (token: string) => void
  setTokens: (tokens: { access: string; refresh?: string }) => void
  setIsRestoring: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isRestoring: false,

      login: (tokens, user) =>
        set({
          accessToken: tokens.access,
          refreshToken: tokens.refresh,
          user,
          isAuthenticated: true,
          isRestoring: false,
        }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          isRestoring: false,
        }),

      setAccessToken: (token) => set({ accessToken: token }),

      setTokens: ({ access, refresh }) =>
        set((state) => ({
          accessToken: access,
          ...(refresh ? { refreshToken: refresh } : {}),
          isAuthenticated: state.isAuthenticated,
        })),

      setIsRestoring: (value) => set({ isRestoring: value }),
    }),
    {
      name: 'fitops-auth',
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
