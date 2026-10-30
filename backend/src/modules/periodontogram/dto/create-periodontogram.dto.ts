import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePeriodontogramDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  toothNumber: string;

  /** { "DB": 3, "B": 2, "MB": 3, "DL": 4, "L": 3, "ML": 2 } */
  @IsObject()
  probingDepths: Record<string, number>;

  @IsOptional()
  @IsObject()
  gingivalMargin?: Record<string, number>;

  @IsOptional()
  @IsObject()
  clinicalAttachmentLevel?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  furcation?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  mobility?: number;

  @IsOptional()
  @IsBoolean()
  bleedingOnProbing?: boolean;

  @IsOptional()
  @IsBoolean()
  plaque?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
