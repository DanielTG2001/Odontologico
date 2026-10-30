import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  documentType: string; // CI, Pasaporte, etc.

  @IsString()
  @IsNotEmpty()
  documentNumber: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsDateString()
  birthDate: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  @ValidateIf((o) => o.isMinor === true)
  @IsString()
  @IsNotEmpty({ message: 'Tutor es obligatorio si el paciente es menor de edad' })
  tutorName?: string;

  @ValidateIf((o) => o.isMinor === true)
  @IsString()
  tutorDocument?: string;

  @IsOptional()
  @IsString()
  insuranceName?: string;

  @IsOptional()
  @IsString()
  insuranceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // ---- Anamnesis: obligatoria al registrar (RF-02). Si no aplica, escribir "Ninguna" / "Niega" ----
  @IsString()
  @IsNotEmpty({ message: 'Enfermedades sistémicas es obligatorio (escriba "Ninguna" si no aplica)' })
  systemicDiseases: string;

  @IsString()
  @IsNotEmpty({ message: 'Alergias es obligatorio (escriba "Niega" si no tiene)' })
  allergies: string;

  @IsString()
  @IsNotEmpty({ message: 'Antecedentes quirúrgicos es obligatorio (escriba "Ninguno" si no aplica)' })
  surgicalHistory: string;

  @IsString()
  @IsNotEmpty({ message: 'Coagulopatías es obligatorio (escriba "No" si no aplica)' })
  coagulopathies: string;

  @IsString()
  @IsNotEmpty({ message: 'Medicación actual es obligatoria (escriba "Ninguna" si no toma)' })
  medications: string;

  @IsOptional()
  @IsBoolean()
  hasCriticalAlert?: boolean;

  @IsOptional()
  @IsString()
  criticalAlertReason?: string;
}
