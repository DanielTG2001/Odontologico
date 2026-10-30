import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  medication: string;

  @IsOptional() @IsString() @MaxLength(120)
  presentation?: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  dose: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  frequency: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  duration: string;

  @IsOptional() @IsString() @MaxLength(40)
  route?: string;

  @IsOptional() @IsString() @MaxLength(60)
  quantity?: string;

  @IsOptional() @IsString() @MaxLength(300)
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsString() @IsNotEmpty()
  patientId: string;

  @IsOptional() @IsString()
  appointmentId?: string;

  @IsOptional() @IsString() @MaxLength(300)
  diagnosis?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  indications?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La receta debe tener al menos un medicamento' })
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  /**
   * Justificación clínica para prescribir pese a una alerta de alergia.
   * Sin ella, la receta se rechaza con 409.
   */
  @IsOptional() @IsString() @MinLength(10) @MaxLength(500)
  allergyOverride?: string;

  /** Firma táctil base64 (opcional; si no, firma electrónica por hash). */
  @IsOptional() @IsString()
  signatureData?: string;
}

export class AnnulPrescriptionDto {
  @IsString() @MinLength(5) @MaxLength(300)
  reason: string;
}
