import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'

/** OIDC Back-Channel Logout 1.0: form-encoded `logout_token` (a JWT signed by uniauth). */
export class BackchannelLogoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8192)
  logout_token: string
}
