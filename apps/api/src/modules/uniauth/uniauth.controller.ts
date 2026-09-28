import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth'
import type { UserSession } from '@thallesp/nestjs-better-auth'
import { BackchannelLogoutDto } from './dto/backchannel-logout.dto'
import { UniauthLogoutService } from './uniauth-logout.service'

@ApiExcludeController()
@Controller('uniauth')
export class UniauthController {
  constructor(private readonly logout: UniauthLogoutService) {}

  /** Called by uniauth (server-to-server) when the user signs out there. */
  @Post('backchannel-logout')
  @AllowAnonymous()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async backchannelLogout(@Body() dto: BackchannelLogoutDto) {
    if (!(await this.logout.handle(dto.logout_token))) {
      throw new BadRequestException('invalid logout_token')
    }
    return null
  }

  /**
   * Where to send the browser after ending the unishare session, so uniauth ends its own too.
   * Fetched before signing out: it needs the session to find the user's ID token.
   */
  @Get('logout-url')
  @Header('Cache-Control', 'no-store')
  logoutUrl(@Session() session: UserSession) {
    return this.logout.endSessionUrl(session.user.id)
  }
}
