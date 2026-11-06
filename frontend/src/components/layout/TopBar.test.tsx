import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopBar } from './TopBar'

vi.mock('../../api/notifications', () => ({
  listNotifications: vi.fn().mockResolvedValue({ results: [] }),
  markAllNotificationsRead: vi.fn(),
  acceptCoverFromNotification: vi.fn(),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }))

const LONG_NAME = 'The Extremely Long Named Northern Arena Health and Fitness Centre'

function renderTopBar(onMenuClick = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TopBar title={LONG_NAME} onMenuClick={onMenuClick} />
    </QueryClientProvider>,
  )
  return onMenuClick
}

// On a phone the menu button used to float over the header (position: fixed),
// covering the start of the title: "…thern Arena". It now sits in the
// header's own row, so the title starts after it and can't be covered.
describe('the top bar on a phone', () => {
  it('holds the menu button in its own row, before the title', () => {
    renderTopBar()
    const header = screen.getByRole('banner')
    const menu = screen.getByRole('button', { name: 'Open menu' })
    const title = screen.getByRole('heading', { name: LONG_NAME })

    expect(header).toContainElement(menu)
    expect(menu.className).not.toMatch(/\bfixed\b/)
    // Same row, button first.
    expect(menu.parentElement).toBe(title.parentElement)
    expect(menu.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the button a 44px tap target that never shrinks, and only on small screens', () => {
    renderTopBar()
    const menu = screen.getByRole('button', { name: 'Open menu' })
    expect(menu).toHaveClass('h-11', 'w-11', 'shrink-0', 'md:hidden')
  })

  it('cuts a long title off with an ellipsis instead of pushing the bell off screen', () => {
    renderTopBar()
    const title = screen.getByRole('heading', { name: LONG_NAME })
    expect(title).toHaveClass('truncate', 'min-w-0', 'flex-1')
    // The full name is still there for anyone who hovers or uses a screen reader.
    expect(title).toHaveAttribute('title', LONG_NAME)
  })

  it('opens the menu when pressed', async () => {
    const onMenuClick = renderTopBar()
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })
})
