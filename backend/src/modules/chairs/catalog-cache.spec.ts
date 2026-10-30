import { NotFoundException } from '@nestjs/common';
import { ChairsService } from './chairs.service';
import { ProceduresService } from '../procedures/procedures.service';
import { createPrismaMock, memoryRedis } from '../../test-utils/mocks';

describe.each([
  ['ChairsService', ChairsService, 'chair', 'catalog:chairs'],
  ['ProceduresService', ProceduresService, 'procedure', 'catalog:procedures'],
] as const)('%s (catálogo cacheado en Redis)', (_name, Svc, model, key) => {
  it('findAll consulta la BD una sola vez y se invalida al escribir', async () => {
    const prisma: any = createPrismaMock();
    const redis = memoryRedis();
    const svc: any = new (Svc as any)(prisma, redis);
    prisma[model].findMany.mockResolvedValue([{ id: '1' }]);
    prisma[model].findUnique.mockResolvedValue({ id: '1', isActive: true });
    prisma[model].create.mockResolvedValue({ id: '2' });
    prisma[model].update.mockResolvedValue({ id: '1' });

    await svc.findAll();
    await svc.findAll();
    expect(prisma[model].findMany).toHaveBeenCalledTimes(1);
    expect(await redis.get(key)).not.toBeNull();

    await svc.create({ name: 'Nuevo' });
    expect(await redis.get(key)).toBeNull();
    await svc.findAll();
    await svc.update('1', { name: 'X' });
    expect(await redis.get(key)).toBeNull();
    await svc.findAll();
    await svc.remove('1');
    expect(await redis.get(key)).toBeNull();
    expect(prisma[model].update.mock.calls[1][0].data).toEqual({ isActive: false });

    prisma[model].findUnique.mockResolvedValue(null);
    await expect(svc.findOne('x')).rejects.toThrow(NotFoundException);
  });
});
