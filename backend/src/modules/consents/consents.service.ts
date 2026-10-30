import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { SignConsentDto } from './dto/sign-consent.dto';
import { ConsentStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/dto/send-notification.dto';

/** Intentos de OTP antes de invalidar el código */
export const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class ConsentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private redis: RedisService,
  ) {}

  async create(dto: CreateConsentDto, createdById: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || !patient.isActive) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const consent = await this.prisma.consent.create({
      data: {
        patientId: dto.patientId,
        procedureName: dto.procedureName,
        templateKey: dto.templateKey,
        content: dto.content,
        createdById,
        status: ConsentStatus.PENDING,
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: createdById,
        action: 'CREATE',
        entity: 'Consent',
        entityId: consent.id,
      },
    });

    return consent;
  }

  /** Genera OTP y lo envía al paciente por WhatsApp/SMS */
  async sendOtp(consentId: string) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
      include: { patient: true },
    });
    if (!consent) throw new NotFoundException('Consentimiento no encontrado');
    if (consent.status !== ConsentStatus.PENDING) {
      throw new BadRequestException('El consentimiento ya no está pendiente');
    }

    const otp = String(randomInt(100000, 1000000)); // CSPRNG
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.prisma.consent.update({
      where: { id: consentId },
      data: { otpCode: otp, otpExpiresAt: expires, otpVerified: false },
    });
    await this.redis.del(`otp:fail:${consentId}`);

    if (consent.patient.phone) {
      await this.notifications.send({
        channel: NotificationChannel.WHATSAPP,
        type: NotificationType.CUSTOM,
        to: consent.patient.phone,
        patientName: `${consent.patient.firstName} ${consent.patient.lastName}`,
        customMessage: `Tu código de verificación para el consentimiento de "${consent.procedureName}" es: ${otp}. Válido por 15 minutos.`,
      });
    }

    return {
      message: 'OTP enviado al paciente',
      expiresAt: expires,
      // En desarrollo devolvemos el OTP para pruebas; quitar en producción
      debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  async sign(consentId: string, dto: SignConsentDto, actorId: string) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
    });
    if (!consent) throw new NotFoundException('Consentimiento no encontrado');
    if (consent.status !== ConsentStatus.PENDING) {
      throw new BadRequestException('El consentimiento ya no está pendiente');
    }

    // Validar OTP si se envía
    if (dto.otpCode) {
      const failKey = `otp:fail:${consentId}`;
      if (Number((await this.redis.get(failKey)) || 0) >= MAX_OTP_ATTEMPTS) {
        throw new HttpException('Demasiados intentos. Solicite un nuevo código OTP.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (
        !consent.otpCode ||
        consent.otpCode !== dto.otpCode ||
        !consent.otpExpiresAt ||
        consent.otpExpiresAt < new Date()
      ) {
        const attempts = await this.redis.incr(failKey, 15 * 60);
        if (attempts >= MAX_OTP_ATTEMPTS) {
          // Invalida el código: hay que pedir uno nuevo
          await this.prisma.consent.update({ where: { id: consentId }, data: { otpCode: null, otpExpiresAt: null } });
        }
        throw new UnauthorizedException('Código OTP inválido o expirado');
      }
      await this.redis.del(failKey);
    }

    // Debe haber firma biométrica o OTP verificado
    if (!dto.signatureData && !dto.otpCode) {
      throw new BadRequestException(
        'Debe proporcionar firma (signatureData) o código OTP',
      );
    }

    const updated = await this.prisma.consent.update({
      where: { id: consentId },
      data: {
        status: ConsentStatus.SIGNED,
        signedAt: new Date(),
        signedByName: dto.signedByName,
        signatureData: dto.signatureData,
        otpVerified: !!dto.otpCode,
        otpCode: null, // limpiar
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'SIGN',
        entity: 'Consent',
        entityId: consentId,
        newValues: { signedByName: dto.signedByName },
      },
    });

    return updated;
  }

  async findByPatient(patientId: string) {
    return this.prisma.consent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async findOne(id: string) {
    const consent = await this.prisma.consent.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, documentNumber: true },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!consent) throw new NotFoundException('Consentimiento no encontrado');
    return consent;
  }

  async revoke(id: string, actorId: string) {
    const consent = await this.findOne(id);
    if (consent.status !== ConsentStatus.SIGNED) {
      throw new BadRequestException('Solo se pueden revocar consentimientos firmados');
    }

    const updated = await this.prisma.consent.update({
      where: { id },
      data: { status: ConsentStatus.REVOKED },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'REVOKE',
        entity: 'Consent',
        entityId: id,
      },
    });

    return updated;
  }
}
