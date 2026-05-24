import axios from 'axios'
import apiClient from './client'
import type { AuthUser, TokenPair } from '../types'

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse extends TokenPair {
  user: AuthUser
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  // Step 1: get tokens
  const tokenRes = await apiClient.post<TokenPair>('auth/token/', credentials)
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
