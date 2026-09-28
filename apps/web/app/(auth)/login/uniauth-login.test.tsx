import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const params = { error: null as string | null }

vi.mock('@/src/lib/auth/mode', () => ({ isUniauthMode: true, uniauthURL: 'http://auth.test' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'error' ? params.error : null) }),
}))
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}))
vi.mock('@/src/lib/api/generated/universities/universities', () => ({
  useUniversitiesControllerFindAll: () => ({ data: [] }),
}))
vi.mock('@/src/lib/auth/client', () => ({
  authClient: { signIn: { oauth2: vi.fn(), social: vi.fn(), email: vi.fn() } },
}))

// Imported after the mocks so the page sees AUTH_MODE=uniauth.
const { default: LoginPage } = await import('./page')
const { authClient } = await import('@/src/lib/auth/client')

describe('login page in uniauth mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    params.error = null
    sessionStorage.clear()
  })

  it('offers uniauth sign-in and guest access, not the password form', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue as guest' })).toBeTruthy()
    expect(screen.queryByPlaceholderText('Password')).toBeNull()
  })

  it('starts an interactive uniauth sign-in that returns to the feed', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(authClient.signIn.oauth2).toHaveBeenCalledWith({
      providerId: 'uniauth',
      callbackURL: `${window.location.origin}/feed`,
      errorCallbackURL: `${window.location.origin}/auth/return`,
    })
  })

  it('explains real errors but stays quiet about login_required', () => {
    params.error = 'BANNED_USER'
    const { unmount } = render(<LoginPage />)
    expect(screen.getByText('Your Unishare account has been suspended.')).toBeTruthy()
    unmount()
    params.error = 'login_required'
    render(<LoginPage />)
    expect(screen.queryByText(/failed|suspended/i)).toBeNull()
  })
})
