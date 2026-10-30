import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SIGO-Dental...');

  // Admin user
  const passwordHash = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sigo.dental' },
    update: {},
    create: {
      email: 'admin@sigo.dental',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Sistema',
      role: Role.ADMIN_TI,
      mfaEnabled: false,
    },
  });

  // Sample chairs
  const chairs = await Promise.all([
    prisma.chair.upsert({
      where: { id: 'chair-1' },
      update: {},
      create: { id: 'chair-1', name: 'Sillón 1', location: 'Consultorio A' },
    }),
    prisma.chair.upsert({
      where: { id: 'chair-2' },
      update: {},
      create: { id: 'chair-2', name: 'Sillón 2', location: 'Consultorio B' },
    }),
  ]);

  // Sample procedures
  await prisma.procedure.createMany({
    data: [
      { code: 'CONS-01', name: 'Consulta general', basePrice: 150, durationMinutes: 30, category: 'Consulta' },
      { code: 'LIM-01', name: 'Limpieza dental', basePrice: 250, durationMinutes: 45, category: 'Preventivo' },
      { code: 'RES-01', name: 'Resina simple', basePrice: 350, durationMinutes: 40, category: 'Restauración' },
      { code: 'EXT-01', name: 'Extracción simple', basePrice: 400, durationMinutes: 30, category: 'Cirugía' },
      { code: 'END-01', name: 'Endodoncia unirradicular', basePrice: 1200, durationMinutes: 90, category: 'Endodoncia', requiresLab: false },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seed completed');
  console.log({ admin: admin.email, chairs: chairs.map(c => c.name) });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
