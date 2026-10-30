import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FileKind } from '@prisma/client';

export class UploadFileDto {
  @IsEnum(FileKind, { message: 'Tipo de archivo inválido' })
  kind: FileKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
