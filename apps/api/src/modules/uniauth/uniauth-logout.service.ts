import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { resolveLocalUserId } from '../mcp/mcp-token.verifier'
import { LOGOUT_EVENT, verifyUniauthEvent } from './uniauth-event-token'

/**
 * Ends a user's unishare sessions when they sign out of uniauth (or another app signs them
 * out everywhere).
 */
@Injectable()
export class UniauthLogoutService {
  private readonly logger = new Logger(UniauthLogoutService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Returns false for an invalid token (the caller answers 400, per the spec). */
  async handle(logoutToken: string): Promise<boolean> {
    const uniauthUserId = await verifyUniauthEvent(logoutToken, LOGOUT_EVENT)
    if (!uniauthUserId) return false

    const userId = await resolveLocalUserId(this.prisma, uniauthUserId)
    if (!userId) return true // never signed in to unishare: nothing to end
    const { count } = await this.prisma.session.deleteMany({ where: { userId } })
    this.logger.log(`Back-channel logout ended ${count} session(s) for ${userId}`)
    return true
  }
}
