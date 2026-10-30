import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '@prisma/client';

const CACHE_KEY = 'catalog:procedures';
const CACHE_TTL = 300; // 5 min

@Injectable()
export class ProceduresService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async create(data: Prisma.ProcedureCreateInput) {
    const created = await this.prisma.procedure.create({ data });
    await this.redis.del(CACHE_KEY);
    return created;
  }

  /** Catálogo cacheado en Redis (se invalida al crear/editar/borrar). */
  findAll() {
    return this.redis.remember(CACHE_KEY, CACHE_TTL, () =>
      this.prisma.procedure.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async findOne(id: string) {
    const proc = await this.prisma.procedure.findUnique({ where: { id } });
    if (!proc || !proc.isActive) throw new NotFoundException('Procedimiento no encontrado');
    return proc;
  }

  async update(id: string, data: Prisma.ProcedureUpdateInput) {
    await this.findOne(id);
    const result = await this.prisma.procedure.update({ where: { id }, data });
    await this.redis.del(CACHE_KEY);
    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    const result = await this.prisma.procedure.update({
      where: { id },
      data: { isActive: false },
    });
    await this.redis.del(CACHE_KEY);
    return result;
  }
}
