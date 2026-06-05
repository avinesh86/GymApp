import axios from 'axios'
import apiClient from './client'
import type { AuthUser, TokenPair } from '../types'

export interface LoginCredentials {
  email: string
  password: string
  // Set when the user belongs to multiple gyms and has picked one.
  tenant_id?: number
}

export interface Gym {
  tenant_id: number
  slug: string
  name: string
  role: string
}

export interface AuthSuccess extends TokenPair {
  user: AuthUser
}

export interface GymSelectionRequired {
  requires_gym_selection: true
  gyms: Gym[]
}

export type LoginResponse = AuthSuccess | GymSelectionRequired

export function isGymSelection(res: LoginResponse): res is GymSelectionRequired {
  return 'requires_gym_selection' in res && res.requires_gym_selection
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  // Step 1: authenticate. When the user belongs to >1 gym and none is chosen,
  // the backend returns the gym list (HTTP 200) instead of tokens.
  const tokenRes = await apiClient.post<TokenPair & Partial<GymSelectionRequired>>(
    'auth/token/',
    credentials,
  )
  if (tokenRes.data.requires_gym_selection) {
    return tokenRes.data as GymSelectionRequired
  }

  const { access, refresh } = tokenRes.data

  // Step 2: fetch user profile using the new token directly (store not yet updated)
  const userRes = await axios.get<AuthUser>('/api/v1/users/me/', {
    headers: { Authorization: `Bearer ${access}` },
  })

  return { access, refresh, user: userRes.data }
}

export async function refreshToken(refresh: string): Promise<{ access: string }> {
  const response = await apiClient.post<{ access: string }>('auth/token/refresh/', { refresh })
  return response.data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<AuthUser>('auth/me/')
  return response.data
}
