import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_KEY = 'catalog:chairs';
const CACHE_TTL = 300; // 5 min

@Injectable()
export class ChairsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async create(data: { name: string; location?: string }) {
    const created = await this.prisma.chair.create({ data });
    await this.redis.del(CACHE_KEY);
    return created;
  }

  /** Catálogo cacheado en Redis (se invalida al crear/editar/borrar). */
  findAll() {
    return this.redis.remember(CACHE_KEY, CACHE_TTL, () =>
      this.prisma.chair.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findOne(id: string) {
    const chair = await this.prisma.chair.findUnique({ where: { id } });
    if (!chair || !chair.isActive) throw new NotFoundException('Sillón no encontrado');
    return chair;
  }

  async update(id: string, data: { name?: string; location?: string; isActive?: boolean }) {
    await this.findOne(id);
    const result = await this.prisma.chair.update({ where: { id }, data });
    await this.redis.del(CACHE_KEY);
    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    const result = await this.prisma.chair.update({
      where: { id },
      data: { isActive: false },
    });
    await this.redis.del(CACHE_KEY);
    return result;
  }
}
