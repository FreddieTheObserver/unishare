import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { McpAuthSession } from './dto/mcp-auth-session.dto'

/**
 * When set, MCP access tokens are issued by uniauth and verified here against its
 * JWKS; unishare's own Better Auth mcp() plugin is bypassed. Unset keeps the
 * legacy in-process flow (removed once unishare's auth moves to uniauth).
 *
 * e.g. MCP_AUTH_ISSUER=https://auth.psstee.dev/api/auth
 */
export const mcpAuthIssuer = process.env.MCP_AUTH_ISSUER || undefined

/** Canonical MCP resource URL — the audience uniauth binds tokens to. */
export const mcpResource = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/mcp`

// Keys are fetched lazily and cached by jose; a token signed by a rotated key
// triggers one refetch (rate-limited by jose's cooldown).
const jwks = mcpAuthIssuer ? createRemoteJWKSet(new URL(`${mcpAuthIssuer}/jwks`)) : undefined

export async function verifyMcpAccessToken(token: string): Promise<McpAuthSession | null> {
  if (!jwks || !mcpAuthIssuer) return null
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
export function protectedResourceMetadata(scopes: string[]) {
  return {
    resource: mcpResource,
    authorization_servers: [mcpAuthIssuer],
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
  }
}
