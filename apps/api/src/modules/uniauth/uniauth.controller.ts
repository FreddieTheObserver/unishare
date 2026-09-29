import { BadRequestException, Body, Controller, Header, HttpCode, Post } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { BackchannelLogoutDto } from './dto/backchannel-logout.dto'
import { UniauthEventDto } from './dto/uniauth-event.dto'
import { UniauthLogoutService } from './uniauth-logout.service'
import { UniauthUserDeletedService } from './uniauth-user-deleted.service'
import { UniauthUserUpdatedService } from './uniauth-user-updated.service'

@ApiExcludeController()
@Controller('uniauth')
export class UniauthController {
  constructor(
    private readonly logout: UniauthLogoutService,
    private readonly userDeleted: UniauthUserDeletedService,
    private readonly userUpdated: UniauthUserUpdatedService,
  ) {}

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

  /** Called by uniauth (server-to-server) when the user deletes their uniauth account. */
  @Post('user-deleted')
  @AllowAnonymous()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async userDeletedNotice(@Body() dto: UniauthEventDto) {
    if (!(await this.userDeleted.handle(dto.token))) {
      throw new BadRequestException('invalid token')
    }
    return null
  }

  /** Called by uniauth (server-to-server) when the user's profile or universities change. */
  @Post('user-updated')
  @AllowAnonymous()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async userUpdatedNotice(@Body() dto: UniauthEventDto) {
    if (!(await this.userUpdated.handle(dto.token))) {
      throw new BadRequestException('invalid token')
    }
    return null
  }
}
