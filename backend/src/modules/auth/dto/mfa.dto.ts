import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'El código MFA debe tener 6 dígitos' })
  code: string;
}

export class MfaEnableDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'El código MFA debe tener 6 dígitos' })
  code: string;
}
