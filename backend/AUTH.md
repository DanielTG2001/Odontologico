# Módulo de Autenticación – SIGO-Dental

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Público | Solo crea el **primer** usuario (bootstrap). Después responde 403 |
| POST | `/api/auth/login` | Público | Login. Devuelve token, `requiresMfa` o `requiresMfaSetup` |
| GET | `/api/auth/me` | JWT (también token de setup) | Perfil + `mfaRequired` |
| POST | `/api/auth/mfa/setup` | JWT (también token de setup) | Genera secret + QR |
| POST | `/api/auth/mfa/enable` | JWT (también token de setup) | Confirma el código, activa MFA y **devuelve el token completo** |
| POST | `/api/auth/mfa/disable` | JWT | Solo para roles donde la MFA no es obligatoria |
| POST | `/api/auth/logout` | JWT | Revoca el token actual (Redis) |
| POST | `/api/auth/admin/register` | JWT + ADMIN_TI | Alta de usuarios |
| POST | `/api/auth/admin/users/:id/mfa/reset` | JWT + ADMIN_TI | Restablece la MFA (dispositivo perdido) |

## MFA obligatoria (RNF-05)

Variables:

| Variable | Default | Efecto |
|----------|---------|--------|
| `MFA_ENFORCE` | `true` | `false` desactiva la obligatoriedad (**solo desarrollo**) |
| `MFA_REQUIRED_ROLES` | *(vacío)* | Vacío = todos los roles. Ej. `ODONTOLOGO,CAJERO` |

### Primer inicio de sesión (enrolamiento)

1. `POST /auth/login` con email + password.
2. Si el rol exige MFA y el usuario no la tiene:
   ```json
   { "requiresMfaSetup": true, "setupToken": "<jwt 10 min, scope mfa-setup>" }
   ```
3. Con `Authorization: Bearer <setupToken>` → `POST /auth/mfa/setup` → `{ secret, qrCode }`.
4. El usuario escanea el QR (Google Authenticator, Microsoft Authenticator, Authy).
5. `POST /auth/mfa/enable` `{ "code": "123456" }` → `{ accessToken, user }`.

El token de setup **no** sirve para nada más: `MfaGuard` responde
`403 { code: "MFA_SETUP_REQUIRED" }` en cualquier otra ruta. Lo mismo ocurre con un token
completo de un usuario que debería tener MFA y no la tiene (por ejemplo, tras un reset).

### Inicios de sesión siguientes

1. `POST /auth/login` → `{ "requiresMfa": true }`
2. `POST /auth/login` con `mfaCode` → `{ accessToken, user }`

## Protección contra fuerza bruta (Redis)

- 5 intentos fallidos por email (20 por IP) bloquean el login 15 minutos → `429`.
- 5 códigos inválidos al activar MFA bloquean 15 minutos.
- Si `REDIS_URL` no está definido, los contadores viven en memoria (solo desarrollo).

## Tokens

- Payload: `{ sub, email, role, scope: 'full' | 'mfa-setup', jti }`.
- `POST /auth/logout` guarda `revoked:<jti>` en Redis hasta que el token expira;
  `JwtStrategy` rechaza tokens revocados.
- El frontend cierra la sesión tras 15 min de inactividad.

## Orden de guards globales

`JwtAuthGuard` → `MfaGuard` → `RolesGuard`

```ts
@Public()          // sin autenticación
@AllowMfaSetup()   // accesible con token de setup / sin MFA activada
@Roles(Role.ADMIN_TI, Role.ODONTOLOGO)
@CurrentUser('id') userId: string
```
