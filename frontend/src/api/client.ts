import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/auth'

const BASE_URL = '/api/v1/'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: attach access token ─────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Token refresh machinery ──────────────────────────────────────────────────

let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token as string)
    }
  })
  pendingQueue = []
}

// ─── Response interceptor: handle 401 with token refresh ─────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    const { refreshToken, logout, setAccessToken } = useAuthStore.getState()

    if (!refreshToken) {
      logout()
      // logout() clears isAuthenticated — React Router's RequireAuth will
      // redirect to /login on next render. No hard navigation needed.
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then((token) => {
        // Mark as retried so a subsequent 401 on this request does not
        // trigger yet another refresh cycle.
        originalRequest._retry = true
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const response = await axios.post(`${BASE_URL}auth/token/refresh/`, {
        refresh: refreshToken,
      })

      const newAccessToken: string = response.data.access
      const newRefreshToken: string | undefined = response.data.refresh
      const { setTokens } = useAuthStore.getState()
      setTokens({ access: newAccessToken, refresh: newRefreshToken })
      processQueue(null, newAccessToken)

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      logout()
      // logout() clears isAuthenticated — React Router's RequireAuth will
      // redirect to /login on next render. No hard navigation needed.
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default apiClient
