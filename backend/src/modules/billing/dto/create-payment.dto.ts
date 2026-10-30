import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string; // número de voucher, transferencia, etc.

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Para pagos mixtos en una sola operación */
export class CreateMixedPaymentDto {
  @IsNotEmpty()
  payments: CreatePaymentDto[];
}
