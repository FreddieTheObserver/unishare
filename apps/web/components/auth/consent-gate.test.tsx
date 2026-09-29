import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentGate } from './consent-gate'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}))
const signOut = vi.fn()
vi.mock('@/src/lib/auth/sign-out', () => ({ signOut: () => signOut() }))

describe('ConsentGate', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
    vi.clearAllMocks()
  })

  it('records consent, then lets the user in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    global.fetch = fetchMock
    const onAccepted = vi.fn()
    render(<ConsentGate onAccepted={onAccepted} />)

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    await userEvent.click(screen.getByRole('button', { name: 'I agree' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/users/me/consent', {
      method: 'POST',
      credentials: 'include',
    })
    expect(onAccepted).toHaveBeenCalled()
  })

  it('keeps the user out and says so when saving fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    const onAccepted = vi.fn()
    render(<ConsentGate onAccepted={onAccepted} />)

    await userEvent.click(screen.getByRole('button', { name: 'I agree' }))

    expect(await screen.findByText(/Could not save that/)).toBeInTheDocument()
    expect(onAccepted).not.toHaveBeenCalled()
  })

  it('offers a way out', async () => {
    render(<ConsentGate onAccepted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now, sign out' }))
    expect(signOut).toHaveBeenCalled()
  })
})
