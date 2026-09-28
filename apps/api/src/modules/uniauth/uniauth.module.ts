import { Module } from '@nestjs/common'
import { isUniauthMode } from '@/auth/auth-mode'
import { UniauthController } from './uniauth.controller'
import { UniauthLogoutService } from './uniauth-logout.service'

/** uniauth → unishare callbacks. Mounted only when AUTH_MODE=uniauth. */
@Module({
  controllers: isUniauthMode ? [UniauthController] : [],
  providers: [UniauthLogoutService],
})
export class UniauthModule {}
