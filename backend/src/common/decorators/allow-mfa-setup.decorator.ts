import { SetMetadata } from '@nestjs/common';

/**
 * Marca rutas accesibles con un token de "configuración de MFA" (scope mfa-setup)
 * o por usuarios que todavía no activaron MFA siendo obligatorio.
 */
export const ALLOW_MFA_SETUP_KEY = 'allowMfaSetup';
export const AllowMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP_KEY, true);
