import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { UpdateClinicalNoteDto } from './dto/update-clinical-note.dto';
import { SignNoteDto } from './dto/sign-note.dto';
import { CreateAddendumDto } from './dto/create-addendum.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('clinical-notes')
@ApiBearerAuth('JWT')
@Controller('clinical-notes')
export class ClinicalNotesController {
  constructor(private readonly service: ClinicalNotesService) {}

  @Post()
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI)
  create(@Body() dto: CreateClinicalNoteDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get('patient/:patientId')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR)
  findByPatient(@Param('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get(':id')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ASISTENTE_DENTAL, Role.ADMIN_TI, Role.AUDITOR)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA, Role.ADMIN_TI)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClinicalNoteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Post(':id/sign')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA)
  sign(
    @Param('id') id: string,
    @Body() dto: SignNoteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.sign(id, userId, dto.signatureData);
  }

  /** Adenda firmada (solo profesionales). Única forma de corregir una nota bloqueada. */
  @Post(':id/addenda')
  @Roles(Role.ODONTOLOGO, Role.ESPECIALISTA)
  addAddendum(
    @Param('id') id: string,
    @Body() dto: CreateAddendumDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.addAddendum(id, dto, userId);
  }

  @Post('jobs/lock-expired')
  @Roles(Role.ADMIN_TI)
  lockExpired() {
    return this.service.lockExpiredNotes();
  }
}
