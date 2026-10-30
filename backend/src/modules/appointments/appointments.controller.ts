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
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppointmentStatus, Role } from '@prisma/client';

@ApiTags('appointments')
@ApiBearerAuth('JWT')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
  )
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.create(dto, userId);
  }

  @Get()
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
  )
  findAll(@Query() query: QueryAppointmentsDto) {
    return this.appointmentsService.findAll(query);
  }

  @Get(':id')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.CAJERO,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
  )
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
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
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @Roles(
    Role.ADMIN_TI,
    Role.RECEPCIONISTA,
    Role.ODONTOLOGO,
    Role.ESPECIALISTA,
    Role.ASISTENTE_DENTAL,
  )
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: AppointmentStatus,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.updateStatus(id, status, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA)
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.appointmentsService.remove(id, userId);
  }
}
