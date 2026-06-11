import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CacheReset } from './App'
import { useAuthStore } from './store/auth'

function setUser(id: number | null) {
  act(() => {
    useAuthStore.setState({ user: id === null ? null : ({ id } as never) })
  })
}

describe('CacheReset — clears query cache on user change', () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient()
    setUser(1)
  })

  function renderReset() {
    return render(
      <QueryClientProvider client={client}>
        <CacheReset />
      </QueryClientProvider>,
    )
  }

  it('does not clear on initial mount', () => {
    const clear = vi.spyOn(client, 'clear')
    renderReset()
    expect(clear).not.toHaveBeenCalled()
  })

  it('clears when the user switches (login as a different user)', () => {
    const clear = vi.spyOn(client, 'clear')
    renderReset()
    setUser(2)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('clears on logout (user → null)', () => {
    const clear = vi.spyOn(client, 'clear')
    renderReset()
    setUser(null)
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
