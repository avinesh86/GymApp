import { describe, it, expect, vi, afterEach } from 'vitest'
import apiClient, { LONG_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './client'
import { exportReport } from './reports'
import { downloadInvoicePdf } from './invoices'
import { createImportJob } from './imports'
import { uploadCheckPhoto } from './facilities'
import { createOrUpdatePaymentDetails } from './staff'

afterEach(() => vi.restoreAllMocks())

describe('API client timeouts', () => {
  it('gives up on a request that never answers, rather than waiting on the browser', () => {
    // Without a limit, a hung request left Settings tabs on a spinner (and
    // Save buttons stuck) until the browser gave up, which can take minutes.
    expect(apiClient.defaults.timeout).toBe(REQUEST_TIMEOUT_MS)
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('allows longer for uploads and PDFs, which can genuinely take a while', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: new Blob() })
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: {} })
    const file = new File(['x'], 'x.png')

    await exportReport({ frequency: 'weekly', date: '2026-11-06', sections: [] } as never)
    await downloadInvoicePdf(1)
    await createImportJob('staff' as never, file)
    await uploadCheckPhoto(1, file)
    await createOrUpdatePaymentDetails(1, {}, file)

    for (const call of [...post.mock.calls, ...put.mock.calls]) {
      expect(call[2]).toMatchObject({ timeout: LONG_REQUEST_TIMEOUT_MS })
    }
    expect(get.mock.calls[0][1]).toMatchObject({ timeout: LONG_REQUEST_TIMEOUT_MS })
    expect(post).toHaveBeenCalledTimes(3)
    expect(put).toHaveBeenCalledTimes(1)
  })
})
