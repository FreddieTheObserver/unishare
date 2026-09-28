/**
 * Which identity provider unishare uses. `legacy` (default): its own email/password and
 * Google/Microsoft sign-in. `uniauth`: sign-in happens on uniauth (OIDC, provider id
 * `uniauth`) and unishare keeps only its own session, roles and bans in Better Auth.
 *
 * Temporary: flipped at the phase 5 cutover, `legacy` removed afterwards
 * (docs/uniauth/planning-oidc.md).
 */
export const isUniauthMode = process.env.AUTH_MODE === 'uniauth'

/** Provider id in genericOAuth, the callback path, and account.providerId. */
export const UNIAUTH_PROVIDER_ID = 'uniauth'

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`AUTH_MODE=uniauth requires ${key}`)
  return value
}

export const uniauthConfig = isUniauthMode
  ? {
      // e.g. https://auth.psstee.dev/api/auth
      issuer: required('UNIAUTH_ISSUER').replace(/\/+$/, ''),
      clientId: required('UNIAUTH_CLIENT_ID'),
      clientSecret: required('UNIAUTH_CLIENT_SECRET'),
    }
  : undefined
