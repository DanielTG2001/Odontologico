import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { VitalSignsService } from './vital-signs.service';
import { CreateVitalSignDto } from './dto/create-vital-sign.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('vital-signs')
@ApiBearerAuth('JWT')
@Controller('vital-signs')
export class VitalSignsController {
  constructor(private readonly service: VitalSignsService) {}

  /** Registro por asistente dental u odontólogo (matriz de roles del SRS). */
  @Post()
  @Roles(Role.ASISTENTE_DENTAL, Role.ODONTOLOGO, Role.ESPECIALISTA)
  create(@Body() dto: CreateVitalSignDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(Role.ASISTENTE_DENTAL, Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI, Role.AUDITOR)
  findByPatient(@Param('patientId') patientId: string, @Query('limit') limit?: string) {
    return this.service.findByPatient(patientId, limit ? Number(limit) : 50);
  }
}
