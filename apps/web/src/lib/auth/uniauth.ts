import { authClient } from './client'

/**
 * A signed-out visitor is silently checked at most once per 10 minutes across all tabs, so
 * browsing signed-out doesn't bounce through uniauth on every page, yet signing in on another
 * app is still picked up soon after.
 */
const CHECKED_COOKIE = 'unishare_uniauth_checked'
const CHECK_INTERVAL_SECONDS = 600

function markSilentChecked() {
  document.cookie = `${CHECKED_COOKIE}=1; Max-Age=${CHECK_INTERVAL_SECONDS}; Path=/; SameSite=Lax`
}

const CRAWLER = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i

/** True when a silent check shouldn't run now: done recently, or not a person browsing. */
export function silentCheckDone() {
  if (CRAWLER.test(navigator.userAgent)) return true
  return document.cookie.split('; ').some((c) => c.startsWith(`${CHECKED_COOKIE}=`))
}

/** Where to go back to if uniauth answers with an error (see app/(auth)/auth/return). */
const RETURN_KEY = 'unishare:uniauth-return-to'

/** Reads and clears the page a sign-in attempt started from. */
export function takeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    // Only same-origin paths: this value decides a redirect.
    return value && new URL(value, window.location.origin).origin === window.location.origin
      ? value
      : null
  } catch {
    return null
  }
}

/**
 * Starts sign-in on uniauth and comes back to `returnTo`. `silent` asks with prompt=none:
 * uniauth returns straight away, signed in if the user already is, or with
 * `?error=login_required` (they stay a guest) — no page is ever shown.
 */
export async function signInWithUniauth({
  returnTo,
  silent = false,
}: {
  returnTo: string
  silent?: boolean
}) {
  markSilentChecked()
  try {
    sessionStorage.setItem(RETURN_KEY, returnTo)
  } catch {
    // Without storage an error just lands on /feed.
  }
  await authClient.signIn.oauth2({
    providerId: 'uniauth',
    callbackURL: returnTo,
    // Every error goes through /auth/return: login_required quietly returns to returnTo,
    // anything else (e.g. BANNED_USER) is explained on /login.
    errorCallbackURL: `${window.location.origin}/auth/return`,
    ...(silent && { additionalData: { prompt: 'none' } }),
  })
}

/**
 * Ends the unishare session, then uniauth's (RP-initiated logout). The URL is fetched first:
 * the API needs the session to find the ID token uniauth uses to skip its confirmation page.
 */
export async function signOutOfUniauth() {
  const res = await fetch('/api/uniauth/logout-url', { credentials: 'include' }).catch(() => null)
  const url = res?.ok ? ((await res.json()) as { data?: { url?: string } | null }).data?.url : null
  await authClient.signOut()
  markSilentChecked()
  window.location.assign(url ?? '/')
}
