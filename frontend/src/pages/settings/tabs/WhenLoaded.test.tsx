import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { WhenLoaded } from './WhenLoaded'

function Probe({ fetch }: { fetch: () => Promise<string> }) {
  const query = useQuery({ queryKey: ['probe'], queryFn: fetch })
  return (
    <WhenLoaded query={query} savesKey={['probe']} what="the probe settings">
      {(value) => <p>Value: {value}</p>}
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
})
