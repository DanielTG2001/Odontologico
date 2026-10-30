import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_MFA_SETUP_KEY } from '../decorators/allow-mfa-setup.decorator';
import { isMfaRequired } from '../../modules/auth/mfa-policy';

/**
 * Guard global (después de JwtAuthGuard): bloquea todo acceso a datos clínicos y
 * financieros si el usuario debe tener MFA y aún no la activó, o si el token es
 * solo de configuración de MFA.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return true; // JwtAuthGuard ya rechazó

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_SETUP_KEY, targets)) return true;

    if (user.tokenScope === 'mfa-setup' || (isMfaRequired(user.role) && !user.mfaEnabled)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MFA_SETUP_REQUIRED',
        message: 'Debe activar la autenticación multifactor (MFA) para acceder.',
      });
    }
    return true;
  }
}
