// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

function request(path: string, cookie?: string) {
  return new NextRequest(`https://share.psstee.dev${path}`, {
    headers: cookie ? { cookie } : {},
  })
}

describe('proxy', () => {
  it('moves the old domain-wide session cookie to the host-only name', () => {
    const res = proxy(request('/feed', '__Secure-better-auth.session_token=tok.sig%3D'))
    const setCookies = res.headers.getSetCookie()

    expect(setCookies).toContainEqual(
      expect.stringMatching(/^__Secure-unishare\.session_token=tok\.sig%3D;.*HttpOnly/i),
    )
    expect(setCookies.find((c) => c.startsWith('__Secure-unishare'))).not.toMatch(/Domain=/i)
    expect(setCookies).toContainEqual(
      expect.stringMatching(
        /^__Secure-better-auth\.session_token=; Domain=psstee\.dev;.*Max-Age=0/,
      ),
    )
    // The rewrite to the API authenticates with the new name on this very request.
    expect(res.headers.get('x-middleware-request-cookie')).toContain(
      '__Secure-unishare.session_token=',
    )
  })

  it('leaves browsers that already have the new cookie alone', () => {
    const res = proxy(
      request(
        '/feed',
        '__Secure-unishare.session_token=new; __Secure-better-auth.session_token=old',
      ),
    )
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('treats a moved cookie as signed in', () => {
    const res = proxy(request('/login', '__Secure-better-auth.session_token=tok'))
    expect(res.headers.get('location')).toBe('https://share.psstee.dev/feed')
  })

  it('sends signed-out visitors of protected pages to login with a way back', () => {
    const res = proxy(request('/profile?tab=saved'))
    expect(res.headers.get('location')).toBe(
      'https://share.psstee.dev/login?next=%2Fprofile%3Ftab%3Dsaved',
    )
  })
})
