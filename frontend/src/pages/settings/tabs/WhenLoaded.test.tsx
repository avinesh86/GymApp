import { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query'
import { WhenLoaded } from './WhenLoaded'

/** Like a settings form: takes its value once, when it first appears. */
function Seeded({ value }: { value: string }) {
  const [seeded] = useState(value)
  return <p>Value: {seeded}</p>
}

function Probe({ fetch }: { fetch: () => Promise<string> }) {
  const query = useQuery({ queryKey: ['probe'], queryFn: fetch })
  return (
    <WhenLoaded query={query} savesKey={['probe']} what="the probe settings">
      {(value) => <Seeded value={value} />}
    </WhenLoaded>
  )
}

function renderProbe(fetch: () => Promise<string>, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <Probe fetch={fetch} />
    </QueryClientProvider>,
  )
}

afterEach(() => onlineManager.setOnline(true))

describe('WhenLoaded', () => {
  it('waits for a fresh copy rather than showing an out-of-date cached one', async () => {
    // A form seeded from the old copy would save it back over someone
    // else's newer change.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['probe'], 'old', { updatedAt: Date.now() - 60_000 })
    let finish: (value: string) => void = () => {}
    renderProbe(() => new Promise((resolve) => (finish = resolve)), client)

    expect(screen.queryByText(/Value:/)).not.toBeInTheDocument()

    finish('new')
    expect(await screen.findByText('Value: new')).toBeInTheDocument()
    expect(screen.queryByText('Value: old')).not.toBeInTheDocument()
  })

  it('uses a cached copy that is still fresh straight away', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['probe'], 'cached')
    renderProbe(vi.fn(() => new Promise<string>(() => {})), client)

    expect(screen.getByText('Value: cached')).toBeInTheDocument()
  })

  it('says the role has no access, without a pointless Try again, when the server refuses', async () => {
    const forbidden = new AxiosError('Forbidden', '403', undefined, undefined, {
      status: 403,
      statusText: 'Forbidden',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
    renderProbe(() => Promise.reject(forbidden))

    expect(await screen.findByText("Couldn't load the probe settings")).toBeInTheDocument()
    expect(screen.getByText(/doesn't have access/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps a shown form on screen when its data goes out of date', async () => {
    // Swapping it for a spinner would throw away what the person has typed.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 50 } } })
    client.setQueryData(['probe'], 'cached')
    const fetch = vi.fn(() => new Promise<string>(() => {}))
    renderProbe(fetch, client)
    expect(screen.getByText('Value: cached')).toBeInTheDocument()

    await new Promise((r) => setTimeout(r, 120))
    expect(screen.getByText('Value: cached')).toBeInTheDocument()
  })

  it('keeps a shown form on screen while its own save refreshes the data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['probe'], 'cached')
    renderProbe(() => new Promise<string>(() => {}), client)
    expect(screen.getByText('Value: cached')).toBeInTheDocument()

    await act(async () => {
      void client.invalidateQueries({ queryKey: ['probe'] })
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(screen.getByText('Value: cached')).toBeInTheDocument()
  })

  it("won't fall back to an out-of-date copy when fetching a fresh one fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['probe'], 'old', { updatedAt: Date.now() - 60_000 })
    renderProbe(() => Promise.reject(new Error('offline')), client)

    expect(await screen.findByText("Couldn't load the probe settings")).toBeInTheDocument()
    expect(screen.queryByText('Value: old')).not.toBeInTheDocument()
  })

  it('on coming back mid-save, waits for the save and the refresh after it', async () => {
    // The fetch made on coming back can return the copy from before the save.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['probe'], 'old', { updatedAt: Date.now() - 60_000 })
    let finishSave: () => void = () => {}
    let server = 'old'
    void client
      .getMutationCache()
      .build(client, {
        mutationKey: ['probe'],
        mutationFn: () => new Promise<void>((resolve) => (finishSave = resolve)),
        onSuccess: () => {
          server = 'new'
          void client.invalidateQueries({ queryKey: ['probe'] })
        },
      })
      .execute(undefined)

    // Each GET answers with what the server held when it was sent.
    renderProbe(() => {
      const answer = server
      return new Promise((resolve) => setTimeout(() => resolve(answer), 20))
    }, client)
    await new Promise((r) => setTimeout(r, 50)) // the copy from before the save arrives
    expect(screen.queryByText(/Value:/)).not.toBeInTheDocument()

    act(() => finishSave())
    expect(await screen.findByText('Value: new')).toBeInTheDocument()
  })

  it('says to check the connection when a request times out', async () => {
    // What the API client's timeout turns a request that never answers into.
    const timedOut = new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED)
    renderProbe(() => Promise.reject(timedOut))

    expect(await screen.findByText('Check your connection and try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says to check the connection when offline, rather than spinning', async () => {
    onlineManager.setOnline(false)
    renderProbe(() => Promise.resolve('value'))

    expect(await screen.findByText('Check your connection and try again.')).toBeInTheDocument()
  })
})
