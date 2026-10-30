import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { isMfaRequired } from './mfa-policy';
import type { TokenScope } from './jwt.strategy';
import { jwtSecret } from './jwt-secret';

/** SECURITY_CHECKLIST: 5 intentos fallidos / 15 min */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 15 * 60;
const SETUP_TOKEN_TTL = '10m';

type UserForToken = { id: string; email: string; role: Role; firstName: string; lastName: string; mfaEnabled: boolean };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  // ==================== REGISTER ====================
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        newValues: { email: user.email, role: user.role },
      },
    });

    return {
      message: 'Usuario registrado correctamente',
      user,
    };
  }

  /**
   * Registro público: solo si aún no existe ningún usuario.
   * Evita que cualquiera se auto-registre con rol ADMIN_TI (RNF-05, menor privilegio).
   */
  async registerBootstrap(dto: RegisterDto) {
    const count = await this.prisma.user.count();
    if (count > 0) {
      throw new ForbiddenException(
        'El registro público está deshabilitado. Solicite su cuenta al Administrador TI.',
      );
    }
    return this.register(dto);
  }

  // ==================== RATE LIMIT (Redis) ====================
  private failKeys(email: string, ip?: string) {
    const keys = [`login:fail:email:${email}`];
    if (ip) keys.push(`login:fail:ip:${ip}`);
    return keys;
  }

  private async assertNotLocked(email: string, ip?: string) {
    for (const key of this.failKeys(email, ip)) {
      const count = Number((await this.redis.get(key)) || 0);
      // El límite por IP es más amplio (varias personas pueden compartir la red de la clínica)
      const limit = key.includes(':ip:') ? MAX_LOGIN_ATTEMPTS * 4 : MAX_LOGIN_ATTEMPTS;
      if (count >= limit) {
        const ttl = await this.redis.ttl(key);
        const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : LOCKOUT_SECONDS) / 60));
        throw new HttpException(
          `Demasiados intentos fallidos. Intente nuevamente en ${minutes} min.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async registerFailure(email: string, ip?: string) {
    for (const key of this.failKeys(email, ip)) await this.redis.incr(key, LOCKOUT_SECONDS);
  }

  private async clearFailures(email: string) {
    await this.redis.del(`login:fail:email:${email}`);
  }

  private verifyTotp(secret: string, token: string) {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
  }

  // ==================== LOGIN ====================
  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.toLowerCase();
    await this.assertNotLocked(email, ip);

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      await this.registerFailure(email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.registerFailure(email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // MFA obligatoria pero aún no configurada → token limitado solo para configurarla
    if (!user.mfaEnabled && isMfaRequired(user.role)) {
      const setupToken = await this.signToken(user, 'mfa-setup');
      await this.audit(user.id, 'LOGIN_MFA_SETUP_REQUIRED', ip);
      return {
        requiresMfa: false,
        requiresMfaSetup: true,
        setupToken: setupToken.token,
        message: 'Debe configurar la autenticación multifactor para continuar.',
        user: this.publicUser(user),
      };
    }

    if (user.mfaEnabled) {
      if (!dto.mfaCode) {
        return { requiresMfa: true, message: 'Se requiere código MFA' };
      }
      if (!this.verifyTotp(user.mfaSecret!, dto.mfaCode)) {
        await this.registerFailure(email, ip);
        throw new UnauthorizedException('Código MFA inválido');
      }
    }

    await this.clearFailures(email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit(user.id, 'LOGIN', ip);

    const { token } = await this.signToken(user, 'full');
    return { requiresMfa: false, accessToken: token, user: this.publicUser(user) };
  }

  // ==================== LOGOUT (revocación en Redis) ====================
  async logout(jti: string | undefined, exp: number | undefined, userId: string) {
    if (jti) {
      const ttl = exp ? Math.max(1, exp - Math.floor(Date.now() / 1000)) : 8 * 3600;
      await this.redis.set(`revoked:${jti}`, '1', ttl);
    }
    await this.audit(userId, 'LOGOUT');
    return { message: 'Sesión cerrada' };
  }

  // ==================== MFA SETUP ====================
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA ya está activado');
    }

    const secret = speakeasy.generateSecret({
      name: `${this.config.get('MFA_APP_NAME') || 'SIGO-Dental'} (${user.email})`,
      length: 20,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32 },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      message:
        'Escanea el código QR con tu app de autenticación (Google Authenticator, Authy, etc.)',
    };
  }

  // ==================== MFA ENABLE ====================
  /** Activa MFA y devuelve un token completo para continuar sin volver a iniciar sesión. */
  async enableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) {
      throw new BadRequestException('Primero debes iniciar el setup de MFA');
    }

    const failKey = `mfa:fail:${userId}`;
    if (Number((await this.redis.get(failKey)) || 0) >= MAX_LOGIN_ATTEMPTS) {
      throw new HttpException('Demasiados códigos inválidos. Espere 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!this.verifyTotp(user.mfaSecret, code)) {
      await this.redis.incr(failKey, LOCKOUT_SECONDS);
      throw new UnauthorizedException('Código MFA inválido');
    }
    await this.redis.del(failKey);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, lastLoginAt: new Date() },
    });

    await this.audit(userId, 'MFA_ENABLED');

    const { token } = await this.signToken(updated, 'full');
    return { message: 'MFA activado correctamente', accessToken: token, user: this.publicUser(updated) };
  }

  // ==================== MFA DISABLE ====================
  async disableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA no está activado');
    }

    if (isMfaRequired(user.role)) {
      throw new ForbiddenException('La MFA es obligatoria para su rol y no puede desactivarse.');
    }

    if (!this.verifyTotp(user.mfaSecret, code)) {
      throw new UnauthorizedException('Código MFA inválido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    await this.audit(userId, 'MFA_DISABLED');

    return { message: 'MFA desactivado correctamente' };
  }

  /** Admin TI: restablece la MFA de un usuario que perdió su dispositivo. */
  async adminResetMfa(targetUserId: string, actorId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (targetUserId === actorId) {
      throw new ForbiddenException('No puede restablecer su propia MFA; solicítelo a otro administrador.');
    }
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'MFA_RESET', entity: 'User', entityId: targetUserId },
    });
    return { message: 'MFA restablecida. El usuario deberá configurarla en su próximo inicio de sesión.' };
  }

  // ==================== PROFILE ====================
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new UnauthorizedException();
    return { ...user, mfaRequired: isMfaRequired(user.role) };
  }

  // ==================== HELPERS ====================

  async listUsers(role?: string) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(role ? { role: role as any } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private publicUser(u: UserForToken) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      mfaEnabled: u.mfaEnabled,
    };
  }

  private async audit(actorId: string, action: string, ip?: string) {
    await this.prisma.auditLog.create({
      data: { actorId, action, entity: 'User', entityId: actorId, ipAddress: ip ?? null },
    });
  }

  private async signToken(user: { id: string; email: string; role: Role }, scope: TokenScope) {
    const jti = randomUUID();
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role, scope, jti },
      {
        secret: jwtSecret(this.config.get<string>('JWT_SECRET')),
        expiresIn: (scope === 'mfa-setup' ? SETUP_TOKEN_TTL : this.config.get<string>('JWT_EXPIRES_IN') || '8h') as any,
      },
    );
    return { token, jti };
  }
}
