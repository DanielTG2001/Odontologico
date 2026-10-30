import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertToothDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  toothNumber: string; // "11", "21", etc.

  @IsOptional()
  @IsIn(['FDI', 'UNIVERSAL'])
  notation?: string = 'FDI';

  /**
   * Ejemplo:
   * {
   *   "status": "present",
   *   "M": "caries",
   *   "O": "restoration",
   *   "D": null,
   *   "V": "sealant",
   *   "L": null,
   *   "I": null
   * }
   * Valores de superficie: caries | restoration | endodontics | implant | missing | sealant | crown | pontic | null
   */
  @IsObject()
  surfaces: Record<string, any>;

  @IsOptional()
  @IsString()
  notes?: string;
}
