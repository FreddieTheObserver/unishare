import { Injectable, Logger } from '@nestjs/common'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { uniauthConfig } from '@/auth/auth-mode'
import { PrismaService } from '@/prisma/prisma.service'
import { resolveLocalUserId } from '../mcp/mcp-token.verifier'

const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout'

/**
 * Ends a user's unishare sessions when they sign out of uniauth (or another app signs them
 * out everywhere). Only the logout token's signature, issuer and audience are trusted.
 */
@Injectable()
export class UniauthLogoutService {
  private readonly logger = new Logger(UniauthLogoutService.name)
  private readonly jwks = uniauthConfig
    ? createRemoteJWKSet(new URL(`${uniauthConfig.issuer}/jwks`))
    : undefined

  constructor(private readonly prisma: PrismaService) {}

  /** Returns false for an invalid token (the caller answers 400, per the spec). */
  async handle(logoutToken: string): Promise<boolean> {
    if (!this.jwks || !uniauthConfig) return false
    let payload: JWTPayload
    try {
      ;({ payload } = await jwtVerify(logoutToken, this.jwks, {
        issuer: uniauthConfig.issuer,
        audience: uniauthConfig.clientId,
      }))
    } catch {
      return false
    }
    // Spec §2.6: must carry the logout event, must not carry a nonce (so an ID token can't be
    // replayed as a logout token), and must identify the user.
    const events = payload.events as Record<string, unknown> | undefined
    if (!events || typeof events[LOGOUT_EVENT] !== 'object' || 'nonce' in payload) return false
    if (typeof payload.sub !== 'string') return false

    const userId = await resolveLocalUserId(this.prisma, payload.sub)
    if (!userId) return true // never signed in to unishare: nothing to end
    const { count } = await this.prisma.session.deleteMany({ where: { userId } })
    this.logger.log(`Back-channel logout ended ${count} session(s) for ${userId}`)
    return true
  }
}
