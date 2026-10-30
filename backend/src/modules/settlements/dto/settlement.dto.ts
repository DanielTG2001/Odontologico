import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CommissionType } from '@prisma/client';

export class CreateCommissionRuleDto {
  @IsString() @IsNotEmpty() doctorId: string;
  @IsOptional() @IsString() procedureId?: string;
  @IsEnum(CommissionType) type: CommissionType;
  @IsNumber() @Min(0) value: number;
}

export class CreateSettlementDto {
  @IsString() @IsNotEmpty() doctorId: string;
  @IsDateString() periodFrom: string;
  @IsDateString() periodTo: string;
  @IsOptional() @IsString() notes?: string;
}
