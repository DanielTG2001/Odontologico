import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PeriodontogramService } from './periodontogram.service';
import { CreatePeriodontogramDto } from './dto/create-periodontogram.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('periodontogram')
@ApiBearerAuth('JWT')
@Controller('periodontogram')
export class PeriodontogramController {
  constructor(private readonly service: PeriodontogramService) {}

  @Post()
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI)
  create(@Body() dto: CreatePeriodontogramDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR)
  getByPatient(
    @Param('patientId') patientId: string,
    @Query('examDate') examDate?: string,
  ) {
    return this.service.getByPatient(patientId, examDate);
  }

  @Get('patient/:patientId/latest')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI)
  getLatest(@Param('patientId') patientId: string) {
    return this.service.getLatestFull(patientId);
  }
}
