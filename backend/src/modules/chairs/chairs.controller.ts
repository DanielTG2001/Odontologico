import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ChairsService } from './chairs.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('chairs')
@ApiBearerAuth('JWT')
@Controller('chairs')
export class ChairsController {
  constructor(private readonly chairsService: ChairsService) {}

  @Post()
  @Roles(Role.ADMIN_TI)
  create(@Body() body: { name: string; location?: string }) {
    return this.chairsService.create(body);
  }

  @Get()
  findAll() {
    return this.chairsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chairsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_TI)
  update(@Param('id') id: string, @Body() body: any) {
    return this.chairsService.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_TI)
  remove(@Param('id') id: string) {
    return this.chairsService.remove(id);
  }
}
