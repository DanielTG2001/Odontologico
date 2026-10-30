import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMedicalHistoryDto {
  @IsOptional()
  @IsString()
  systemicDiseases?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  surgicalHistory?: string;

  @IsOptional()
  @IsString()
  coagulopathies?: string;

  @IsOptional()
  @IsString()
  medications?: string;

  @IsOptional()
  @IsBoolean()
  hasCriticalAlert?: boolean;

  @IsOptional()
  @IsString()
  criticalAlertReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
