import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('procedures')
@ApiBearerAuth('JWT')
@Controller('procedures')
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Post()
  @Roles(Role.ADMIN_TI)
  create(@Body() body: any) {
    return this.proceduresService.create(body);
  }

  @Get()
  findAll() {
    return this.proceduresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proceduresService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_TI)
  update(@Param('id') id: string, @Body() body: any) {
    return this.proceduresService.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_TI)
  remove(@Param('id') id: string) {
    return this.proceduresService.remove(id);
  }
}
