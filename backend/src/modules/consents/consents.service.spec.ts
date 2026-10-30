import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConsentsService, MAX_OTP_ATTEMPTS } from './consents.service';
import { createPrismaMock, memoryRedis, PrismaMock } from '../../test-utils/mocks';

describe('ConsentsService (RF-06)', () => {
  let prisma: PrismaMock;
  let notifications: { send: jest.Mock };
  let redis: ReturnType<typeof memoryRedis>;
  let service: ConsentsService;
  const pending = (over: any = {}) => ({ id: 'c1', status: 'PENDING', procedureName: 'Exodoncia', patient: { firstName: 'A', lastName: 'B', phone: '+593' }, ...over });

  beforeEach(() => {
    prisma = createPrismaMock();
    notifications = { send: jest.fn().mockResolvedValue({ success: true }) };
    redis = memoryRedis();
    service = new ConsentsService(prisma as any, notifications as any, redis);
    prisma.consent.update.mockImplementation(async ({ data }: any) => ({ id: 'c1', ...data }));
  });

  it('create genera el consentimiento pendiente', async () => {
    prisma.patient.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.consent.create.mockResolvedValue({ id: 'c1' });
    await service.create({ patientId: 'p1', procedureName: 'Endodoncia', content: '...' } as any, 'doc');
    expect(prisma.consent.create.mock.calls[0][0].data.status).toBe('PENDING');
    prisma.patient.findUnique.mockResolvedValue(null);
    await expect(service.create({ patientId: 'x' } as any, 'doc')).rejects.toThrow(NotFoundException);
  });

  describe('OTP', () => {
    it('genera un código de 6 dígitos, lo envía y vence en 15 min', async () => {
      prisma.consent.findUnique.mockResolvedValue(pending());
      const res: any = await service.sendOtp('c1');
      const data = prisma.consent.update.mock.calls[0][0].data;
      expect(data.otpCode).toMatch(/^\d{6}$/);
      expect(data.otpExpiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
      expect(notifications.send.mock.calls[0][0].customMessage).toContain(data.otpCode);
      expect(res.debugOtp).toBe(data.otpCode);
    });

    it('sin teléfono no envía; estados inválidos', async () => {
      prisma.consent.findUnique.mockResolvedValue(pending({ patient: { phone: null } }));
      await service.sendOtp('c1');
      expect(notifications.send).not.toHaveBeenCalled();
      prisma.consent.findUnique.mockResolvedValue(pending({ status: 'SIGNED' }));
      await expect(service.sendOtp('c1')).rejects.toThrow(BadRequestException);
      prisma.consent.findUnique.mockResolvedValue(null);
      await expect(service.sendOtp('c1')).rejects.toThrow(NotFoundException);
    });

    it('firma con OTP válido', async () => {
      prisma.consent.findUnique.mockResolvedValue(pending({ otpCode: '123456', otpExpiresAt: new Date(Date.now() + 60000) }));
      const res: any = await service.sign('c1', { otpCode: '123456', signedByName: 'Tutor' } as any, 'doc');
      expect(res).toMatchObject({ status: 'SIGNED', otpVerified: true, otpCode: null, signedByName: 'Tutor' });
    });

    it(`invalida el código tras ${MAX_OTP_ATTEMPTS} intentos fallidos`, async () => {
      prisma.consent.findUnique.mockResolvedValue(pending({ otpCode: '123456', otpExpiresAt: new Date(Date.now() + 60000) }));
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
        await expect(service.sign('c1', { otpCode: '000000' } as any, 'doc')).rejects.toThrow(UnauthorizedException);
      }
      expect(prisma.consent.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { otpCode: null, otpExpiresAt: null } });
      const err = await service.sign('c1', { otpCode: '123456' } as any, 'doc').catch((e) => e);
      expect(err.getStatus()).toBe(429);
    });

    it('OTP vencido → 401', async () => {
      prisma.consent.findUnique.mockResolvedValue(pending({ otpCode: '123456', otpExpiresAt: new Date(Date.now() - 1) }));
      await expect(service.sign('c1', { otpCode: '123456' } as any, 'doc')).rejects.toThrow(UnauthorizedException);
    });
  });

  it('firma biométrica sin OTP; exige alguna de las dos', async () => {
    prisma.consent.findUnique.mockResolvedValue(pending());
    await expect(service.sign('c1', { signatureData: 'data:image/png;base64,X' } as any, 'doc')).resolves.toMatchObject({ otpVerified: false });
    await expect(service.sign('c1', {} as any, 'doc')).rejects.toThrow(BadRequestException);
    prisma.consent.findUnique.mockResolvedValue(pending({ status: 'REVOKED' }));
    await expect(service.sign('c1', { signatureData: 'x' } as any, 'doc')).rejects.toThrow(BadRequestException);
    prisma.consent.findUnique.mockResolvedValue(null);
    await expect(service.sign('c1', {} as any, 'doc')).rejects.toThrow(NotFoundException);
  });

  it('consultas y revocación', async () => {
    prisma.consent.findMany.mockResolvedValue([]);
    await service.findByPatient('p1');
    prisma.consent.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    prisma.consent.findUnique.mockResolvedValue({ id: 'c1', status: 'PENDING' });
    await expect(service.revoke('c1', 'doc')).rejects.toThrow(BadRequestException);
    prisma.consent.findUnique.mockResolvedValue({ id: 'c1', status: 'SIGNED' });
    await expect(service.revoke('c1', 'doc')).resolves.toMatchObject({ status: 'REVOKED' });
  });
});
