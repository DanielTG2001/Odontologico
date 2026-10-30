import { NotificationsService } from './notifications.service';
import { RemindersCron } from './reminders.cron';
import { createPrismaMock, memoryRedis, PrismaMock } from '../../test-utils/mocks';

const appt = (id: string, phone: string | null = '+593999') => ({
  id, startAt: new Date('2026-11-01T15:00:00Z'),
  patient: { firstName: 'Ana', lastName: 'Paz', phone }, doctor: { firstName: 'Luis', lastName: 'Mora' },
});

describe('Recordatorios 48 h / 24 h (RF-11)', () => {
  let prisma: PrismaMock;
  let redis: ReturnType<typeof memoryRedis>;
  let twilio: { send: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    redis = memoryRedis();
    twilio = { send: jest.fn().mockResolvedValue({ success: true, messageId: 'm' }) };
    const consoleP = { send: jest.fn().mockResolvedValue({ success: true }) };
    const email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new NotificationsService(prisma as any, consoleP as any, {} as any, twilio as any, email as any, redis);
  });

  it('envía 48 h y 24 h, marca reminderSent y NO duplica en la siguiente corrida', async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([appt('a48')]).mockResolvedValueOnce([appt('a24')]);
    const r1 = await service.sendPendingReminders();
    expect(r1).toMatchObject({ processed48h: 1, processed24h: 1 });
    expect(twilio.send).toHaveBeenCalledTimes(2);
    expect(twilio.send.mock.calls[0][1]).toContain('48 horas');
    expect(twilio.send.mock.calls[1][1]).toContain('mañana');
    expect(prisma.appointment.update).toHaveBeenCalledWith({ where: { id: 'a48' }, data: { reminderSent: true } });

    // La ventana de 23–25 h vuelve a incluir la misma cita una hora después
    prisma.appointment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([appt('a24')]);
    await service.sendPendingReminders();
    expect(twilio.send).toHaveBeenCalledTimes(2);
  });

  it('si el envío falla, libera el candado para reintentar', async () => {
    twilio.send.mockResolvedValue({ success: false, error: 'x' });
    prisma.appointment.findMany.mockResolvedValueOnce([appt('a48')]).mockResolvedValueOnce([appt('a24')]);
    await service.sendPendingReminders();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(await redis.get('reminder:48h:a48')).toBeNull();
    expect(await redis.get('reminder:24h:a24')).toBeNull();
  });

  it('omite pacientes sin teléfono', async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([appt('a', null)]).mockResolvedValueOnce([appt('b', null)]);
    await service.sendPendingReminders();
    expect(twilio.send).not.toHaveBeenCalled();
  });

  describe('RemindersCron', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });

    it('usa un lock distribuido para no ejecutarse dos veces', async () => {
      const notif = { sendPendingReminders: jest.fn().mockResolvedValue({ processed48h: 0, processed24h: 0 }) };
      const cron = new RemindersCron(notif as any, redis);
      await cron.handleReminders();
      await cron.handleReminders();
      expect(notif.sendPendingReminders).toHaveBeenCalledTimes(1);
    });

    it('se puede desactivar y tolera errores', async () => {
      const notif = { sendPendingReminders: jest.fn().mockRejectedValue(new Error('boom')) };
      process.env.DISABLE_REMINDER_CRON = 'true';
      await new RemindersCron(notif as any, redis).handleReminders();
      expect(notif.sendPendingReminders).not.toHaveBeenCalled();
      process.env.DISABLE_REMINDER_CRON = 'false';
      await expect(new RemindersCron(notif as any, redis).handleReminders()).resolves.toBeUndefined();
    });
  });
});

describe('NotificationsService.send', () => {
  function build() {
    const providers = {
      console: { send: jest.fn().mockResolvedValue({ success: true }) },
      twilio: { send: jest.fn().mockResolvedValue({ success: true }) },
      email: { send: jest.fn().mockResolvedValue({ success: false, error: 'smtp' }) },
    };
    const prisma = createPrismaMock();
    const svc = new NotificationsService(prisma as any, providers.console as any, {} as any, providers.twilio as any, providers.email as any, memoryRedis());
    return { svc, providers, prisma };
  }

  it('elige el proveedor según el canal y arma el mensaje', async () => {
    const { svc, providers } = build();
    await svc.send({ channel: 'WHATSAPP', type: 'APPOINTMENT_CONFIRMATION', to: '+593', patientName: 'Ana', appointmentDate: '1/11', appointmentTime: '10:00', doctorName: 'Dr. X' } as any);
    expect(providers.twilio.send.mock.calls[0][1]).toContain('confirmada');
    await svc.send({ channel: 'EMAIL', type: 'APPOINTMENT_CANCELLED', to: 'a@b.c' } as any);
    expect(providers.email.send.mock.calls[0][1]).toContain('cancelada');
    await svc.send({ channel: 'SMS', type: 'CUSTOM', to: '+593', customMessage: 'Hola' } as any);
    expect(providers.console.send.mock.calls[0][1]).toBe('Hola');
    await svc.send({ channel: 'SMS', type: 'OTRO', to: '+593' } as any);
    expect(providers.console.send.mock.calls[1][1]).toBe('Notificación de la clínica');
    await svc.send({ channel: 'SMS', type: 'APPOINTMENT_REMINDER_24H', to: '+593' } as any);
    await svc.send({ channel: 'SMS', type: 'APPOINTMENT_REMINDER_48H', to: '+593', doctorName: 'Dr. Y' } as any);
  });

  it('confirmación de cita', async () => {
    const { svc, prisma, providers } = build();
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(svc.notifyAppointmentConfirmation('x')).resolves.toMatchObject({ success: false });
    prisma.appointment.findUnique.mockResolvedValue(appt('a1'));
    await svc.notifyAppointmentConfirmation('a1');
    expect(providers.twilio.send).toHaveBeenCalled();
  });
});
