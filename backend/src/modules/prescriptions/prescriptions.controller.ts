import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { AnnulPrescriptionDto, CreatePrescriptionDto } from './dto/prescription.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const PRESCRIBERS = [Role.ODONTOLOGO, Role.ESPECIALISTA];
const READERS = [Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR];

@ApiTags('prescriptions')
@ApiBearerAuth('JWT')
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly service: PrescriptionsService) {}

  @Post()
  @Roles(...PRESCRIBERS)
  create(@Body() dto: CreatePrescriptionDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(...READERS)
  findByPatient(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get(':id')
  @Roles(...READERS)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/annul')
  @Roles(...PRESCRIBERS)
  annul(@Param('id') id: string, @Body() dto: AnnulPrescriptionDto, @CurrentUser('id') userId: string) {
    return this.service.annul(id, dto, userId);
  }
}
