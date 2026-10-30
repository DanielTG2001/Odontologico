# Rotación de credenciales expuestas

El `backend/.env` original contenía en texto plano el **Auth Token de Twilio** y la **contraseña de Gmail**.
Como el archivo circuló dentro de un zip, hay que darlos por comprometidos. Esto **solo lo puede hacer el dueño
de las cuentas**; nadie más tiene acceso.

## 1. Gmail (prioridad máxima: es la contraseña de la cuenta)

1. Cambia la contraseña de Google: <https://myaccount.google.com/security> → *Contraseña*.
2. En la misma página activa la **Verificación en 2 pasos**.
3. Revisa *Tus dispositivos* y cierra las sesiones que no reconozcas.
4. Crea una **contraseña de aplicación** para el sistema: <https://myaccount.google.com/apppasswords>
   (nombre: `SIGO-Dental`). Son 16 caracteres; esa va en `SMTP_PASS`, **nunca** la contraseña real.
5. Corrige también `SMTP_USER`: en el original decía `justintomala01@gmail.com.com` (sobra un `.com`).

```env
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=abcd efgh ijkl mnop   # contraseña de aplicación
```

> Si la misma contraseña se usaba en otros servicios, cámbiala también allí.

## 2. Twilio

1. Consola de Twilio → **Account → API keys & tokens**.
2. En **Auth Tokens**, pulsa **Request a secondary token** → *Request Token*.
3. Copia el token secundario (icono del ojo) y ponlo en `TWILIO_AUTH_TOKEN` de todos los entornos.
4. Reinicia la API y envía un recordatorio de prueba.
5. Vuelve a la consola y pulsa **Promote to Primary**: el token anterior queda revocado al instante.
6. Revisa en *Monitor → Logs* si hubo mensajes que no enviaste (uso indebido del token).

**Mejor práctica:** en lugar del Auth Token principal, crea una **API Key** (*Create API key*, tipo *Standard*)
solo para SIGO-Dental. Si se filtra, se revoca esa clave sin afectar el resto de la cuenta.

## 3. Si el proyecto está en GitHub

Si alguna vez se hizo `git commit` del `.env`, el secreto sigue en el historial aunque se haya borrado:

```bash
git log --all --oneline -- backend/.env      # ¿aparece?
```

Si aparece: rota las credenciales (pasos 1 y 2, lo más importante) y luego limpia el historial con
[`git filter-repo`](https://github.com/newren/git-filter-repo) o BFG. Para evitar que se repita:

- `.gitignore` ya excluye `.env`, `*.p12`, `certs/` y `.env.prod`.
- El CI ejecuta **gitleaks** en cada push y falla si detecta un secreto (`.github/workflows/ci.yml`).
- En el servidor, los secretos van en `.env.prod` (fuera del repositorio) o en el gestor de secretos del hosting.

## Lista de verificación

- [ ] Contraseña de Google cambiada y 2FA activada
- [ ] Contraseña de aplicación creada y puesta en `SMTP_PASS`
- [ ] Token de Twilio rotado (secundario promovido a primario)
- [ ] Recordatorio de prueba enviado con las credenciales nuevas
- [ ] Historial de Git revisado
