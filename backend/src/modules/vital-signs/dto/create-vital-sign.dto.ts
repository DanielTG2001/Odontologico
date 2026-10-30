import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateVitalSignDto {
  @IsString() @IsNotEmpty()
  patientId: string;

  @IsOptional() @IsString()
  appointmentId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(300)
  systolic?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(30) @Max(200)
  diastolic?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(250)
  heartRate?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(4) @Max(60)
  respiratoryRate?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(45)
  temperature?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(100)
  oxygenSaturation?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(20) @Max(800)
  glucose?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(400)
  weightKg?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(30) @Max(250)
  heightCm?: number;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
