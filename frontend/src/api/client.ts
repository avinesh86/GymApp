import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/auth'

const BASE_URL = '/api/v1/'

/**
 * How long loading data may take before it's given up as failed. Without a
 * limit, a request that never answers leaves the page waiting (a spinner that
 * never stops) until the browser itself gives up, which can take minutes.
 * With one, it fails like any network error and the page can say "Check your
 * connection and try again". Loading changes nothing, so trying again is safe.
 */
export const REQUEST_TIMEOUT_MS = 30_000

/**
 * How long anything that changes data (save, create, delete, upload, send)
 * may take, and reads known to be slow (reports, PDFs). Just over the
 * server's own 120-second limit (gunicorn --timeout, nginx proxy_read_timeout),
 * so the server always answers first: the app never says a save failed when
 * it actually went through, which would invite a retry that duplicates it.
 * Keep it above the server's limit if that changes.
 */
export const LONG_REQUEST_TIMEOUT_MS = 125_000

const READ_METHODS = ['get', 'head', 'options']

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: attach access token ─────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Requests that change data wait as long as the server does (see above).
  // A call that sets its own timeout keeps it.
  const isRead = READ_METHODS.includes((config.method ?? 'get').toLowerCase())
  if (!isRead && config.timeout === REQUEST_TIMEOUT_MS) config.timeout = LONG_REQUEST_TIMEOUT_MS

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
      const response = await axios.post(
        `${BASE_URL}auth/token/refresh/`,
        { refresh: refreshToken },
        { timeout: REQUEST_TIMEOUT_MS },
      )

      const newAccessToken: string = response.data.access
      const newRefreshToken: string | undefined = response.data.refresh
      const { setTokens } = useAuthStore.getState()
      setTokens({ access: newAccessToken, refresh: newRefreshToken })
      processQueue(null, newAccessToken)

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      // Sign out only when the server turned the session down. A timeout or a
      // dropped connection says nothing about the session: keep the person
      // signed in (and what they were typing), and let the page show its
      // connection error.
      if (sessionRejected(refreshError)) {
        logout()
        // logout() clears isAuthenticated — React Router's RequireAuth will
        // redirect to /login on next render. No hard navigation needed.
      }
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

/** True when the server answered and refused the refresh token. */
export function sessionRejected(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  return status === 400 || status === 401
}

export default apiClient
