/**
 * unishare signs people in through uniauth (OIDC, provider id `uniauth`) and keeps only its
 * own session, roles and bans in Better Auth. Passwords and Google/Microsoft sign-in live in
 * uniauth (docs/uniauth/planning-oidc.md).
 */

/** Provider id in genericOAuth, the callback path, and account.providerId. */
export const UNIAUTH_PROVIDER_ID = 'uniauth'

function required(key: string, testValue: string): string {
  const value = process.env[key]
  if (value) return value
  // Unit tests import the auth config without a uniauth to talk to.
  if (process.env.NODE_ENV === 'test') return testValue
  throw new Error(`Missing required environment variable: ${key}`)
}

export const uniauthConfig = {
  // e.g. https://auth.psstee.dev/api/auth
  issuer: required('UNIAUTH_ISSUER', 'http://uniauth.test/api/auth').replace(/\/+$/, ''),
  clientId: required('UNIAUTH_CLIENT_ID', 'unishare-test'),
  clientSecret: required('UNIAUTH_CLIENT_SECRET', 'unishare-test-secret'),
}
