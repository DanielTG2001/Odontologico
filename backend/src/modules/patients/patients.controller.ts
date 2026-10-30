import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('patients')
@ApiBearerAuth('JWT')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
  )
  create(
    @Body() dto: CreatePatientDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.patientsService.create(dto, userId);
  }

  @Get()
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
    Role.AUDITOR,
  )
  findAll(@Query() query: QueryPatientsDto) {
    return this.patientsService.findAll(query);
  }

  @Get(':id')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
    Role.AUDITOR,
  )
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.patientsService.update(id, dto, userId);
  }

  @Patch(':id/medical-history')
  @Roles(
    Role.ADMIN_TI,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
  )
  updateMedicalHistory(
    @Param('id') id: string,
    @Body() dto: UpdateMedicalHistoryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.patientsService.updateMedicalHistory(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA)
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.patientsService.remove(id, userId);
  }
}
