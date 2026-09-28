import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { fromNodeHeaders } from 'better-auth/node'
import type { Request, Response } from 'express'
import { auth } from '@/auth/auth.config'
import type { McpAuthSession } from '@/modules/mcp/dto/mcp-auth-session.dto'
import {
  bearerToken,
  mcpAuthIssuer,
  mcpResource,
  verifyMcpAccessToken,
} from '@/modules/mcp/mcp-token.verifier'

export interface RequestWithMcpSession extends Request {
  mcpSession?: McpAuthSession
}

/**
 * Fetches the MCP OAuth session and attaches it to the request. With MCP_AUTH_ISSUER
 * set the bearer token is a uniauth JWT verified locally; otherwise it goes through
 * unishare's own Better Auth mcp() plugin.
 *
 * McpController uses @OptionalAuth() and manages its own auth — Better Auth's MCP plugin is
 * a separate OAuth token flow from the cookie session every other route relies on. A request
 * can still carry a valid session cookie alongside its bearer token, so `req.session` is not
 * guaranteed to be empty here; UserThrottlerGuard, which runs after this guard, must prefer
 * `req.mcpSession` over `req.session` for that reason.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithMcpSession>()
    const res = context.switchToHttp().getResponse<Response>()

    const session = mcpAuthIssuer
      ? await verifyMcpAccessToken(bearerToken(req.headers.authorization) ?? '')
      : await auth.api.getMcpSession({ headers: fromNodeHeaders(req.headers) })
    if (!session) {
      // uniauth mode: metadata lives next to the resource (RFC 9728 path-suffixed form).
      const metadataURL = mcpAuthIssuer
        ? `${new URL(mcpResource).origin}/.well-known/oauth-protected-resource/mcp`
        : `${this.config.get<string>('BETTER_AUTH_URL') ?? 'http://localhost:3001'}/.well-known/oauth-protected-resource`
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer resource_metadata="${metadataURL}"`)
        .set('Access-Control-Expose-Headers', 'WWW-Authenticate')
        .json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Authentication required' },
          id: null,
        })
      return false
    }

    req.mcpSession = session
    return true
  }
}
