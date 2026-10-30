import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;

  /** Código TOTP de 6 dígitos (requerido si el usuario tiene MFA activado) */
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
