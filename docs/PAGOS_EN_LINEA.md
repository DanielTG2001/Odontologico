# Pasarela de pagos (SRS 7.1)

Cobro en línea de facturas emitidas, con enlace que se envía al paciente por WhatsApp o email.

| Pasarela | Uso recomendado | Variables |
|----------|-----------------|-----------|
| **Payphone** (Ecuador) | Tarjetas locales, app Payphone | `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID` |
| **Stripe** | Tarjetas internacionales | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **mock** | Desarrollo y UAT (se desactiva sola en producción) | — |

```env
PAYMENTS_PROVIDER=payphone          # por defecto
PAYMENTS_ENABLED=payphone,stripe    # las que puede elegir el cajero
FRONTEND_URL=https://app.tu-clinica.ec
```

## ¿Cuál usar para la validación de punta a punta?

| Opción | Requisitos | Recomendación |
|--------|-----------|---------------|
| **Simulada (`mock`)** | Ninguno | Ya funciona de punta a punta en la app (enlace → página de pago → resultado → factura pagada). Ideal para el proyecto y el UAT |
| **Payphone – ambiente de pruebas** | Cuenta en Payphone Developer con una **tienda activa** (comercio registrado) | La opción real para Ecuador. En pruebas las transacciones se aprueban sin pasar por el banco |
| **Stripe – modo prueba** | Cuenta de Stripe en un país soportado | ⚠️ Stripe **no admite cuentas de Ecuador**; solo sirve si la clínica tiene una empresa en un país soportado |

### Validar con Payphone (pruebas)

1. Entra a Payphone Developer, crea una aplicación **WEB** y selecciona el **ambiente de pruebas**.
2. Registra el dominio desde el que se paga (p. ej. `https://staging.tu-clinica.ec`) y la URL de respuesta
   `https://staging.tu-clinica.ec/pay/return`.
3. Copia el **Token** y el **StoreID** al `.env` del staging:
   ```env
   PAYMENTS_PROVIDER=payphone
   PAYMENTS_ENABLED=payphone,mock
   PAYPHONE_TOKEN=...
   PAYPHONE_STORE_ID=...
   FRONTEND_URL=https://staging.tu-clinica.ec
   ```
4. En SIGO: Facturación → factura emitida → *Generar enlace de pago* → *Abrir aquí*.
5. Completa el pago en Payphone. Debes volver a `/pay/return` con **¡Pago realizado!** y la factura en `PAGADA`.
6. Evidencia: captura de la página de resultado, el registro en *Cobro en línea* y la entrada `ONLINE_PAYMENT_CREATE`
   y `PAYMENT` en la auditoría.

> Payphone no funciona desde `localhost`: el dominio debe estar registrado en Payphone Developer.

### Validar con Stripe (si aplica)

```bash
stripe login
stripe listen --forward-to localhost:4000/api/payments/webhooks/stripe   # imprime el whsec_… para STRIPE_WEBHOOK_SECRET
```
Paga con la tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura y CVC.

### Validar con la pasarela simulada

`PAYMENTS_PROVIDER=mock` → *Generar enlace de pago* → *Abrir aquí* → **Pagar** (o *Simular rechazo*).
Se desactiva sola con `NODE_ENV=production`.

## Flujo

1. Caja: factura emitida → **Generar enlace de pago** (`POST /api/payments/online`). Monto por defecto = saldo pendiente.
2. El paciente paga en la pasarela y vuelve a `https://app/pay/return?...`.
3. La página confirma de inmediato con el backend (`POST /api/payments/public/confirm`), que consulta a la pasarela
   **de servidor a servidor**. Payphone exige confirmar en menos de 5 minutos o reversa el cobro.
4. Si está aprobado, se registra el pago en la factura (tarjeta de crédito o débito según la tarjeta), queda auditado
   y la factura pasa a `PARCIAL` o `PAGADA`.

## Seguridad

- Nunca se reciben ni guardan datos de tarjeta: el paciente los ingresa en la página de la pasarela.
- El monto confirmado por la pasarela debe coincidir con el esperado; si no, se marca `FAILED` (anti-manipulación).
- La transición `PENDING → PAID` es atómica: la redirección y el webhook no pueden duplicar el pago.
- Webhook de Stripe: `POST /api/payments/webhooks/stripe`, firma HMAC-SHA256 verificada con tolerancia de 5 min.
  En el panel de Stripe registra los eventos `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`.
- Si el paciente paga cuando la factura ya se saldó en caja, el cobro queda como `ONLINE_PAYMENT_UNAPPLIED`
  en la auditoría para gestionar el reembolso.
- Payphone: registra el dominio de la clínica en Payphone Developer. nginx envía `Referrer-Policy: origin-when-cross-origin`
  como pide Payphone.
- Los cobros pendientes vencen solos (cron cada 10 min).
