import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { OdontogramService } from './odontogram.service';
import { UpsertToothDto } from './dto/upsert-tooth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('odontogram')
@ApiBearerAuth('JWT')
@Controller('odontogram')
export class OdontogramController {
  constructor(private readonly service: OdontogramService) {}

  @Put('tooth')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI)
  upsertTooth(@Body() dto: UpsertToothDto, @CurrentUser('id') userId: string) {
    return this.service.upsertTooth(dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR)
  getPatient(
    @Param('patientId') patientId: string,
    @Query('notation') notation?: string,
  ) {
    return this.service.getPatientOdontogram(patientId, notation || 'FDI');
  }

  @Get('patient/:patientId/tooth/:toothNumber')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI)
  getTooth(
    @Param('patientId') patientId: string,
    @Param('toothNumber') toothNumber: string,
    @Query('notation') notation?: string,
  ) {
    return this.service.getTooth(patientId, toothNumber, notation || 'FDI');
  }
}
