import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import apiClient, { LONG_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './client'
import { useAuthStore } from '../store/auth'
import * as reports from './reports'
import { downloadInvoicePdf } from './invoices'

afterEach(() => vi.restoreAllMocks())

/** Sends a request through the client's interceptors and reports the timeout it went out with. */
async function timeoutSentWith(method: 'get' | 'post' | 'put' | 'patch' | 'delete', timeout?: number) {
  let sent: number | undefined
  await apiClient.request({
    method,
    url: 'anything/',
    ...(timeout ? { timeout } : {}),
    adapter: async (config: InternalAxiosRequestConfig) => {
      sent = config.timeout
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    },
  })
  return sent
}

describe('API client timeouts', () => {
  it('gives up on loading data that never arrives, rather than waiting on the browser', async () => {
    // Without a limit, a hung request left pages on a spinner until the
    // browser gave up, which can take minutes.
    expect(await timeoutSentWith('get')).toBe(REQUEST_TIMEOUT_MS)
  })

  it('lets anything that changes data wait as long as the server does', async () => {
    // Giving up sooner than the server could report a save as failed after it
    // went through, inviting a retry that duplicates it.
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      expect(await timeoutSentWith(method)).toBe(LONG_REQUEST_TIMEOUT_MS)
    }
    expect(LONG_REQUEST_TIMEOUT_MS).toBeGreaterThan(120_000) // the server's own limit
  })

  it('keeps a timeout a call sets for itself', async () => {
    expect(await timeoutSentWith('get', LONG_REQUEST_TIMEOUT_MS)).toBe(LONG_REQUEST_TIMEOUT_MS)
    expect(await timeoutSentWith('post', 10_000)).toBe(10_000)
  })

  it('gives reports and PDFs, which can be slow to build, the long limit', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} })
    await reports.getAttendanceReport('2026-01-01', '2026-02-01')
    await reports.getInstructorReliabilityReport()
    await reports.getInstructorCharts()
    await reports.getPayrollReport()
    await reports.getClassViabilityReport()
    await reports.getClassesReport()
    await reports.getUnrecordedReport('2026-01-01', '2026-02-01')
    await downloadInvoicePdf(1)
    expect(get).toHaveBeenCalledTimes(8)
    for (const call of get.mock.calls) expect(call[1]).toMatchObject({ timeout: LONG_REQUEST_TIMEOUT_MS })
  })
})

describe('when the session needs refreshing', () => {
  const logout = vi.fn()
  beforeEach(() => {
    logout.mockReset()
    useAuthStore.setState({ accessToken: 'old', refreshToken: 'refresh', logout })
  })

  /** A request the server answers with 401, so the client tries a refresh. */
  function requestNeedingRefresh() {
    return apiClient.get('anything/', {
      adapter: async (config: InternalAxiosRequestConfig) => {
        throw new AxiosError('Unauthorized', '401', config, null, {
          status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config,
        })
      },
    })
  }

  it('keeps the person signed in when the refresh times out', async () => {
    // A slow connection says nothing about the session; signing out would
    // lose whatever they were typing.
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED))
    await expect(requestNeedingRefresh()).rejects.toBeTruthy()
    expect(logout).not.toHaveBeenCalled()
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.anything(), { timeout: REQUEST_TIMEOUT_MS })
  })

  it('signs the person out when the server refuses the refresh', async () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError('Unauthorized', '401', config, null, { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config }),
    )
    await expect(requestNeedingRefresh()).rejects.toBeTruthy()
    expect(logout).toHaveBeenCalled()
  })
})
