import axios from 'axios'
import { LONG_REQUEST_TIMEOUT_MS } from './client'
import type { SignupPayload, SignupResponse } from '../types'

export async function signupTenant(payload: SignupPayload): Promise<SignupResponse> {
  // Creates the gym: waits as long as the server does, so it never reports a
  // failure for a signup that went through (see LONG_REQUEST_TIMEOUT_MS).
  const response = await axios.post<SignupResponse>('/api/v1/public/signup/', payload, {
    timeout: LONG_REQUEST_TIMEOUT_MS,
  })
  return response.data
}
