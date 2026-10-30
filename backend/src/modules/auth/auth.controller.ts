import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AllowMfaSetup } from '../../common/decorators/allow-mfa-setup.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaEnableDto, MfaVerifyDto } from './dto/mfa.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';

@ApiTags('auth')
@ApiBearerAuth('JWT')
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ---------- Públicos ----------

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    // Solo permitido para crear el PRIMER usuario (bootstrap).
    // Después, únicamente un ADMIN_TI puede crear usuarios vía /auth/admin/register.
    return this.authService.registerBootstrap(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip);
  }

  // ---------- Protegidos (requieren JWT) ----------

  @Get('me')
  @AllowMfaSetup()
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  /** Inicia el setup de MFA → devuelve secret + QR */
  @Post('mfa/setup')
  @AllowMfaSetup()
  setupMfa(@CurrentUser('id') userId: string) {
    return this.authService.setupMfa(userId);
  }

  /** Confirma el código y activa MFA definitivamente */
  @Post('mfa/enable')
  @AllowMfaSetup()
  @HttpCode(HttpStatus.OK)
  enableMfa(
    @CurrentUser('id') userId: string,
    @Body() dto: MfaEnableDto,
  ) {
    return this.authService.enableMfa(userId, dto.code);
  }

  /** Desactiva MFA (requiere código válido) */
  @Post('mfa/disable')
  disableMfa(
    @CurrentUser('id') userId: string,
    @Body() dto: MfaVerifyDto,
  ) {
    return this.authService.disableMfa(userId, dto.code);
  }


  /** Revoca el token actual (Redis) */
  @Post('logout')
  @AllowMfaSetup()
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: { id: string; jti?: string; exp?: number }) {
    return this.authService.logout(user.jti, user.exp, user.id);
  }

  /** Admin TI restablece la MFA de un usuario (dispositivo perdido) */
  @Post('admin/users/:id/mfa/reset')
  @Roles(Role.ADMIN_TI)
  @HttpCode(HttpStatus.OK)
  resetMfa(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.authService.adminResetMfa(id, actorId);
  }

  @Get('users')
  @Roles(Role.ADMIN_TI, Role.RECEPCIONISTA, Role.CAJERO, Role.ODONTOLOGO, Role.ESPECIALISTA, Role.CONTADOR, Role.AUDITOR)
  listUsers(@Query('role') role?: string) {
    return this.authService.listUsers(role);
  }

  // ---------- Solo Admin TI puede registrar usuarios ----------
  @Post('admin/register')
  @Roles(Role.ADMIN_TI)
  adminRegister(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
