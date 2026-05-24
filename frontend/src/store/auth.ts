import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser, TokenPair } from '../types'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (tokens: TokenPair, user: AuthUser) => void
  logout: () => void
  setAccessToken: (token: string) => void
  setTokens: (tokens: { access: string; refresh?: string }) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (tokens, user) =>
        set({
          accessToken: tokens.access,
          refreshToken: tokens.refresh,
          user,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),

      setAccessToken: (token) => set({ accessToken: token }),

      setTokens: ({ access, refresh }) =>
        set((state) => ({
          accessToken: access,
          ...(refresh ? { refreshToken: refresh } : {}),
          isAuthenticated: state.isAuthenticated,
        })),
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
