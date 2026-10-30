import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateInventoryItemDto {
  @IsString() @IsNotEmpty() sku: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsInt() @Min(0) stockMin?: number;
  @IsOptional() @IsInt() @Min(0) stockCurrent?: number;
  @IsOptional() @IsNumber() costAverage?: number;
}

export class StockMovementDto {
  @IsString() @IsNotEmpty() itemId: string;
  @IsString() @IsNotEmpty() type: string; // IN | OUT | ADJUST | AUTO_DEDUCT | TRANSFER
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsString() reason?: string;
  /** Ubicación de origen / afectada */
  @IsOptional() @IsString() locationId?: string;
  /** Solo para TRANSFER: ubicación destino */
  @IsOptional() @IsString() toLocationId?: string;
}

export class ProcedureRecipeDto {
  @IsString() @IsNotEmpty() procedureId: string;
  @IsString() @IsNotEmpty() itemId: string;
  @IsInt() @Min(1) quantity: number;
}

export class CreateLocationDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  /** WAREHOUSE | CHAIR | PROFESSIONAL | CONSULTORIO */
  @IsString() @IsNotEmpty() type: string;
  @IsOptional() @IsString() chairId?: string;
  @IsOptional() @IsString() doctorId?: string;
}

export class SetStockDto {
  @IsString() @IsNotEmpty() itemId: string;
  @IsString() @IsNotEmpty() locationId: string;
  @IsInt() @Min(0) quantity: number;
  @IsOptional() @IsInt() @Min(0) stockMin?: number;
}
