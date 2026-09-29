import { Module } from '@nestjs/common'
import { UniauthController } from './uniauth.controller'
import { UniauthLogoutService } from './uniauth-logout.service'
import { UniauthUserDeletedService } from './uniauth-user-deleted.service'
import { UniauthUserUpdatedService } from './uniauth-user-updated.service'

/** uniauth → unishare server-to-server callbacks (sign-out, account deletion and updates). */
@Module({
  controllers: [UniauthController],
  providers: [UniauthLogoutService, UniauthUserDeletedService, UniauthUserUpdatedService],
})
export class UniauthModule {}
