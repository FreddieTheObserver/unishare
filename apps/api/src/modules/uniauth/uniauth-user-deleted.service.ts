import { Injectable, Logger } from '@nestjs/common'
import { auth } from '@/auth/auth.config'
import { PrismaService } from '@/prisma/prisma.service'
import { resolveLocalUserId } from '../mcp/mcp-token.verifier'
import { USER_DELETED_EVENT, verifyUniauthEvent } from './uniauth-event-token'

/**
 * Deletes a person's unishare data when their uniauth account is deleted (from uniauth's
 * account page or any other app). Same deletion as "Delete my Unishare data" on the profile
 * page: sessions, accounts, then the user, whose content goes with it (schema cascades).
 */
@Injectable()
export class UniauthUserDeletedService {
  private readonly logger = new Logger(UniauthUserDeletedService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Returns false for an invalid token (the caller answers 400). */
  async handle(token: string): Promise<boolean> {
    const uniauthUserId = await verifyUniauthEvent(token, USER_DELETED_EVENT)
    if (!uniauthUserId) return false

    const userId = await resolveLocalUserId(this.prisma, uniauthUserId)
    if (!userId) return true // never used unishare: nothing to delete
    const { internalAdapter } = await auth.$context
    await internalAdapter.deleteUserSessions(userId)
    await internalAdapter.deleteAccounts(userId)
    await internalAdapter.deleteUser(userId)
    this.logger.log(`Deleted user ${userId} (uniauth account ${uniauthUserId} was deleted)`)
    return true
  }
}
