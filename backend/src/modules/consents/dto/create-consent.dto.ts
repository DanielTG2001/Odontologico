import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConsentDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  procedureName: string;

  @IsOptional()
  @IsString()
  templateKey?: string;

  @IsString()
  @IsNotEmpty()
  content: string; // texto legal
}
