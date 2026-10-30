# Criterios de Aceptación UAT y Salida a Producción – SIGO-Dental

## 1. Cobertura de pruebas (SRS 8.2)
- [x] Cobertura mínima **80 %** en endpoints críticos (`npm run test:cov`, umbral en `jest.config.js`)
  - auth, patients, appointments (RN-03), billing, clinical-notes, odontogram, consents, cash-closing
  - + prescriptions, vital-signs, files, guards (MFA/RBAC), auditoría, Redis, S3
- [ ] Tests de integración de flujo completo:
  1. Login → paciente → cita → atender → facturar → pagar → cierre de caja
  2. Nota SOEP → firmar → verificar bloqueo → agregar adenda firmada
  3. Consentimiento → OTP → firmar
  4. Signos vitales → alerta crítica (PA ≥ 180/110) visible
  5. Receta a paciente alérgico a penicilina → bloqueo 409 → justificar → imprimir
  6. Subir radiografía panorámica → abrir con URL firmada
  7. Factura → enviar al SRI (ambiente de pruebas) → AUTORIZADO → descargar RIDE y XML
  8. Factura → enlace de pago Payphone por WhatsApp → pagar → factura PAGADA
  9. Presupuesto con descuento → bloqueado hasta que otro profesional lo autorice (RF-07)

## 2. Seguridad (SRS 8.2)
- [ ] SAST sin Alta/Crítica (OWASP Top 10)
- [ ] DAST (ZAP) sin Alta/Crítica en staging
- [ ] MFA funcional en cuentas clínicas y de caja (primer login muestra QR obligatorio)

## 3. Documentación (SRS 8.2)
- [x] OpenAPI / Swagger v3.0 en `/api/docs`
- [x] README con endpoints
- [x] SECURITY_CHECKLIST.md
- [x] UAT_ACCEPTANCE.md
- [x] PRODUCTION.md

## 4. Rendimiento (RNF)
- [ ] Expediente + odontograma < 1.5 s → `k6 run loadtest/rnf-load.js` (umbral p95 < 1500 ms)
- [ ] 150 usuarios concurrentes → mismo script (rampa a 150 VUs, 10 min, errores < 0,1 %)
- [ ] Uptime 99.9 % (07:00–21:00) → `loadtest/availability.js` cada minuto + `GET /api/metrics/slo`

## 5. UAT por rol (resumen)
- Recepcionista: alta paciente, agenda, factura, pago
- Odontólogo: alertas, odontograma, periodontograma, SOEP + adendas, consentimiento, recetas, archivos
- Asistente dental: signos vitales, notas, preparación de insumos
- Cajero: pagos, cierre ciego sin ver totales previos
- Admin: usuarios, reportes, inventario, liquidaciones

## 6. Go-Live
- [ ] Migraciones en producción
- [ ] Env de producción configurado
- [ ] Backup PostgreSQL automático
- [ ] Monitoreo activo
- [ ] Capacitación de usuarios
