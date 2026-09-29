import { BadRequestException, Body, Controller, Header, HttpCode, Post } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
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
}
