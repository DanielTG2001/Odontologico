/**
 * Datos para la prueba de carga RNF-01/03 (SOLO staging).
 *   LOADTEST_PASSWORD=... LOADTEST_MFA_SECRET=... npx tsx prisma/seed-loadtest.ts
 *
 * Crea el usuario carga@sigo.dental (ODONTOLOGO, MFA activa con secreto conocido) y
 * pacientes con anamnesis, odontograma, notas SOEP y citas, para que el expediente
 * tenga un tamaño realista.
 */
import { PrismaClient, Role, AppointmentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const N = Number(process.env.LOADTEST_PATIENTS || 200);
const SURFACES = ['caries', 'restoration', 'sealant', null, null];
const TEETH = ['16', '17', '26', '36', '46', '11', '21', '47'];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOADTEST_SEED !== 'yes') {
    throw new Error('Este seed es solo para staging. Si es un staging con NODE_ENV=production, defina ALLOW_LOADTEST_SEED=yes');
  }
  const password = process.env.LOADTEST_PASSWORD;
  const mfaSecret = process.env.LOADTEST_MFA_SECRET;
  if (!password || password.length < 12) throw new Error('Defina LOADTEST_PASSWORD (mínimo 12 caracteres)');
  if (!mfaSecret || !/^[A-Z2-7]{16,}$/.test(mfaSecret)) throw new Error('Defina LOADTEST_MFA_SECRET en base32 (ej. generado con: node loadtest/totp.js --new)');

  const user = await prisma.user.upsert({
    where: { email: 'carga@sigo.dental' },
    update: { passwordHash: await bcrypt.hash(password, 12), mfaEnabled: true, mfaSecret, isActive: true },
    create: {
      email: 'carga@sigo.dental', passwordHash: await bcrypt.hash(password, 12), firstName: 'Prueba', lastName: 'Carga',
      role: Role.ODONTOLOGO, mfaEnabled: true, mfaSecret,
    },
  });

  const chair = await prisma.chair.upsert({ where: { id: 'chair-loadtest' }, update: {}, create: { id: 'chair-loadtest', name: 'Sillón carga', location: 'Staging' } });
  const existing = await prisma.patient.count({ where: { documentType: 'LOADTEST' } });
  console.log(`Usuario ${user.email} listo. Pacientes de carga existentes: ${existing}`);

  for (let i = existing; i < N; i++) {
    const p = await prisma.patient.create({
      data: {
        documentType: 'LOADTEST', documentNumber: `LT${String(i).padStart(6, '0')}`,
        firstName: `Paciente${i}`, lastName: 'Carga', birthDate: new Date(1980 + (i % 30), i % 12, 1 + (i % 27)),
        phone: '+5939' + String(10000000 + i), createdById: user.id,
        medicalHistory: { create: { systemicDiseases: 'Ninguna', allergies: i % 10 === 0 ? 'Penicilina' : 'Niega', surgicalHistory: 'Ninguno', coagulopathies: 'No', medications: 'Ninguna', hasCriticalAlert: i % 10 === 0, criticalAlertReason: i % 10 === 0 ? 'Alergia a penicilina' : null } },
      },
    });
    await prisma.odontogramRecord.createMany({
      data: TEETH.map((t, k) => ({ patientId: p.id, toothNumber: t, notation: 'FDI', surfaces: { O: SURFACES[(i + k) % 5], M: SURFACES[(i + k + 1) % 5], status: 'present' }, recordedById: user.id })),
    });
    await prisma.clinicalNote.createMany({
      data: [0, 1].map((k) => ({ patientId: p.id, authorId: user.id, subjective: 'Dolor al frío en pieza ' + TEETH[k], objective: 'Caries oclusal', evaluation: 'Pulpitis reversible', plan: 'Restauración con resina' })),
    });
    const start = new Date(Date.now() - (i % 60) * 86400000);
    start.setHours(8 + (i % 10), 0, 0, 0);
    await prisma.appointment.create({
      data: { patientId: p.id, doctorId: user.id, chairId: chair.id, startAt: start, endAt: new Date(start.getTime() + 15 * 60000), status: AppointmentStatus.CANCELADO, reason: 'Control (carga)' },
    });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N} pacientes`);
  }
  console.log('Listo.');
}

main().finally(() => prisma.$disconnect());
