import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { FilesService, IncomingFile, MAX_FILE_BYTES } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const CAN_READ = [Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR];
const CAN_UPLOAD = [Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.RECEPCIONISTA];

@ApiTags('files')
@ApiBearerAuth('JWT')
@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post('patient/:patientId')
  @Roles(...CAN_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['RX_PANORAMICA', 'RX_PERIAPICAL', 'RX_OTRA', 'FOTO_INTRAORAL', 'FOTO_EXTRAORAL', 'DOCUMENTO', 'OTRO'] },
        notes: { type: 'string' },
      },
      required: ['file', 'kind'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } }))
  upload(
    @Param('patientId') patientId: string,
    @UploadedFile() file: IncomingFile,
    @Body() dto: UploadFileDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.upload(patientId, file, dto.kind, dto.notes, userId);
  }

  @Get('patient/:patientId')
  @Roles(...CAN_READ)
  list(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  /** Devuelve una URL firmada (5 min). Queda auditado como EXPORT. */
  @Get(':id/download')
  @Roles(...CAN_READ)
  download(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.downloadUrl(id, userId);
  }
}
