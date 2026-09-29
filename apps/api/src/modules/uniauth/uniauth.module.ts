import { Module } from '@nestjs/common'
import { UniauthController } from './uniauth.controller'
import { UniauthLogoutService } from './uniauth-logout.service'
import { UniauthUserDeletedService } from './uniauth-user-deleted.service'

/** uniauth → unishare server-to-server callbacks (sign-out, account deletion). */
@Module({
  controllers: [UniauthController],
  providers: [UniauthLogoutService, UniauthUserDeletedService],
})
export class UniauthModule {}
