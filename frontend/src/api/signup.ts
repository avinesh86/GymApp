import axios from 'axios'
import type { SignupPayload, SignupResponse } from '../types'

export async function signupTenant(payload: SignupPayload): Promise<SignupResponse> {
  const response = await axios.post<SignupResponse>('/api/v1/public/signup/', payload)
  return response.data
}
