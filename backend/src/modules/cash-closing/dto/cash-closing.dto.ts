import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCashClosingDto {
  @IsDateString()
  closingDate: string;

  @IsNumber() @Min(0) countedCash: number;
  @IsOptional() @IsNumber() @Min(0) countedCard?: number;
  @IsOptional() @IsNumber() @Min(0) countedTransfer?: number;
  @IsOptional() @IsNumber() @Min(0) countedOther?: number;
  @IsOptional() @IsString() notes?: string;
}
