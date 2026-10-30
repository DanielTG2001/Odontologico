import { IsOptional, IsString } from 'class-validator';

export class SignNoteDto {
  /** Base64 de la firma o token de firma digital */
  @IsOptional()
  @IsString()
  signatureData?: string;
}
