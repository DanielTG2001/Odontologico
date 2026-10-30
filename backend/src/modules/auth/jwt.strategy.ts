import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { jwtSecret } from './jwt-secret';

export type TokenScope = 'full' | 'mfa-setup';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  jti?: string;
  scope?: TokenScope;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: JwtPayload) {
    // Token revocado al cerrar sesión (Redis)
    if (payload.jti && (await this.redis.get(`revoked:${payload.jti}`))) {
      throw new UnauthorizedException('Sesión cerrada');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado o inactivo');
    }

    return { ...user, tokenScope: payload.scope ?? 'full', jti: payload.jti, exp: payload.exp };
  }
}
