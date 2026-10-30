import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignConsentDto {
  @IsString()
  @IsNotEmpty()
  signedByName: string;

  /** Base64 de la firma capturada en tablet */
  @IsOptional()
  @IsString()
  signatureData?: string;

  /** Código OTP recibido por el paciente */
  @IsOptional()
  @IsString()
  otpCode?: string;
}
