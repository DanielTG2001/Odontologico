import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TreatmentItemDto {
  @IsString() @IsNotEmpty() procedureId: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsNumber() unitPrice: number;
  @IsOptional() @IsNumber() labCost?: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsInt() @Min(1) phase?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateTreatmentPlanDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() discount?: number;
  /** RF-07: motivo del descuento (convenio, paciente frecuente…) */
  @IsOptional() @IsString() @MaxLength(300) discountReason?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreatmentItemDto)
  items: TreatmentItemDto[];
}

export class ReviewDiscountDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class ApproveItemsDto {
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];

  /** Si true, crea citas borrador/agendables a partir de los ítems (RF-08) */
  @IsOptional()
  @IsBoolean()
  createAppointments?: boolean;

  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() chairId?: string;
  @IsOptional() @IsString() startAt?: string; // ISO primera cita
  @IsOptional() @IsInt() slotMinutes?: number;
}
