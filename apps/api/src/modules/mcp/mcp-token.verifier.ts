import { createRemoteJWKSet, jwtVerify } from 'jose'
import { uniauthConfig } from '@/auth/uniauth-config'
import type { McpAuthSession } from './dto/mcp-auth-session.dto'

/**
 * MCP access tokens are issued by uniauth and verified here against its JWKS.
 * MCP_AUTH_ISSUER overrides the issuer (defaults to UNIAUTH_ISSUER).
 *
 * The session's userId is the token's `sub` — a **uniauth** user id. Callers map it to the
 * local user with resolveLocalUserId before touching unishare data.
 */
export const mcpAuthIssuer = (process.env.MCP_AUTH_ISSUER || uniauthConfig.issuer).replace(
  /\/+$/,
  '',
)

/** The permissions unishare's MCP tools check; uniauth only issues them. */
export const mcpScopes = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'boards:read',
  'boards:write',
  'posts:read',
  'posts:write',
  'courses:read',
]

/** Canonical MCP resource URL — the audience uniauth binds tokens to. */
export const mcpResource = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/mcp`

// Keys are fetched lazily and cached by jose; a token signed by a rotated key
// triggers one refetch (rate-limited by jose's cooldown).
const jwks = createRemoteJWKSet(new URL(`${mcpAuthIssuer}/jwks`))

export async function verifyMcpAccessToken(token: string): Promise<McpAuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: mcpAuthIssuer,
      audience: mcpResource,
    })
    if (typeof payload.sub !== 'string') return null
    return { userId: payload.sub, scopes: typeof payload.scope === 'string' ? payload.scope : '' }
  } catch {
    return null
  }
}

export function bearerToken(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

/** RFC 9728 metadata telling MCP clients that uniauth is the authorization server. */
export function protectedResourceMetadata(scopes: string[] = mcpScopes) {
  return {
    resource: mcpResource,
    authorization_servers: [mcpAuthIssuer],
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
  }
}

/**
 * uniauth user id → unishare user id, via the account row Better Auth writes at OIDC sign-in
 * (providerId 'uniauth', accountId = uniauth id). Users imported from unishare keep the same
 * id and get that row too, so there is one rule. Null when the person has never signed in to
 * unishare.
 */
export async function resolveLocalUserId(
  prisma: { account: { findFirst: (args: object) => Promise<{ userId: string } | null> } },
  uniauthUserId: string,
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { providerId: 'uniauth', accountId: uniauthUserId },
    select: { userId: true },
  })
  return account?.userId ?? null
}
