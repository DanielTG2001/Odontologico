import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAddendumDto {
  @IsString()
  @MinLength(5, { message: 'Indique el motivo de la corrección' })
  @MaxLength(500)
  reason: string;

  @IsString()
  @IsNotEmpty({ message: 'La adenda no puede estar vacía' })
  @MaxLength(10000)
  content: string;

  /** Imagen base64 de la firma táctil; si no se envía se usa la firma electrónica del usuario autenticado. */
  @IsOptional()
  @IsString()
  signatureData?: string;
}
