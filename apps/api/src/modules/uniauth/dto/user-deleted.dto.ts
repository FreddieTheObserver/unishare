import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'

/** uniauth's account-deletion notice: form-encoded `token` (a JWT signed by uniauth). */
export class UserDeletedDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8192)
  token: string
}
