import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PROTECTED_PATHS = ['/my-posts', '/profile', '/posts/new', '/admin']

/** Must match advanced.cookiePrefix in the API's auth config. */
const COOKIE_PREFIX = 'unishare'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7

function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * The session cookie used to be `better-auth.session_token` on the whole parent domain
 * (.psstee.dev). It's now `unishare.session_token`, host-only. A browser that still has the
 * old one keeps its session: the value moves to the new name (on this request too) and the
 * domain-wide cookie is expired. Remove once sessions from before the move have expired
 * (7 days after the deploy).
 */
function takeOverLegacySessionCookie(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })) return null
  for (const secure of [true, false]) {
    const prefix = secure ? '__Secure-' : ''
    const legacyName = `${prefix}better-auth.session_token`
    const value = request.cookies.get(legacyName)?.value
    if (!value) continue
    const name = `${prefix}${COOKIE_PREFIX}.session_token`
    request.cookies.set(name, value)
    return (response: NextResponse) => {
      response.cookies.set(name, value, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      })
      response.cookies.delete(legacyName)
      const host = request.nextUrl.hostname
      if (host.includes('.') && !/^[\d.]+$/.test(host)) {
        const parent = host.split('.').slice(-2).join('.')
        response.headers.append(
          'Set-Cookie',
          `${legacyName}=; Domain=${parent}; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
        )
      }
      return response
    }
  }
  return null
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const takeOver = takeOverLegacySessionCookie(request)
  const finish = (response: NextResponse) => (takeOver ? takeOver(response) : response)
  const hasSession = getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX })

  if (!hasSession && isProtected(pathname)) {
    const login = new URL('/login', request.url)
    // The login page checks uniauth silently and returns here.
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return finish(NextResponse.redirect(login))
  }

  if (hasSession && pathname === '/login') {
    return finish(NextResponse.redirect(new URL('/feed', request.url)))
  }

  if (hasSession && pathname === '/') {
    return finish(NextResponse.redirect(new URL('/feed', request.url)))
  }

  // Rewrites to the API (/api/*) run after this, with the updated cookie header.
  return finish(NextResponse.next({ request: { headers: request.headers } }))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
