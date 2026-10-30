# Verificación contra el SRS v1.0 – SIGO-Dental

Revisión del código contra el *Documento de Especificación de Requerimientos* (29/10/2026).

Leyenda: ✅ cumple · 🟡 parcial · ❌ no implementado · ⚪ no verificable en código · 🔧 corregido o agregado en la revisión

## Requerimientos funcionales

| ID | Requerimiento | Estado | Observación |
|----|---------------|--------|-------------|
| RF-01 | Ficha única del paciente | ✅ | Tutor obligatorio si es menor. |
| RF-02 | Anamnesis obligatoria + badge de alerta crítica | ✅ 🔧 | Anamnesis ahora **obligatoria** al registrar (“Ninguna”/“Niega” si no aplica). Alerta automática por penicilina, látex, anestésicos, AINEs, anticoagulantes y coagulopatías al crear y al editar. |
| RF-03 | Odontograma 32 + 20, FDI + Universal, superficies, catálogo | ✅ 🔧 | Endodoncia realizada / requerida y exodoncia indicada diferenciadas. |
| RF-04 | Periodontograma (6 puntos, margen, NIC, furca, movilidad, sangrado) | ✅ 🔧 | Fórmula del NIC corregida (PS − MG) y captura de margen gingival en pantalla. |
| RF-05 | Notas SOEP inmutables, bloqueo 24 h, firma | ✅ 🔧 | **Adendas firmadas** (SHA-256) para corregir notas bloqueadas; triggers impiden reescribir notas bloqueadas o re-firmarlas. |
| RF-06 | Consentimiento con firma táctil u OTP | ✅ 🔧 | OTP con `crypto.randomInt` y máximo 5 intentos (antes `Math.random` y sin límite). |
| RF-07 | Presupuestos por fases, laboratorio y descuentos autorizados | ✅ 🔧 | Todo descuento queda *pendiente* hasta que otro profesional lo autorice (cuatro ojos); umbral de auto-aprobación y roles configurables; el presupuesto no se envía ni se aprueba mientras esté pendiente. |
| RF-08 | Aprobación total/parcial → citas | ✅ 🔧 | Las citas generadas ahora validan RN-03 (antes podían cruzarse en el sillón). |
| RF-09 | Calendario día/semana por sillón y profesional | ✅ 🔧 | Vista semanal y filtros agregados. |
| RF-10 | 7 estados de cita | ✅ | |
| RF-11 | Recordatorios 48 h y 24 h | ✅ 🔧 | **Corregido:** el de 24 h se enviaba dos veces (la ventana cubría 2 ejecuciones del cron). Ahora se deduplica con Redis y el cron usa lock distribuido. |
| RF-12 | Facturación electrónica + pagos mixtos | ✅ 🔧 | Flujo SRI completo. Modo por defecto **`sri-simulado`** (mismo XML, clave de acceso, validaciones y RIDE, sin firma ni conexión). Pasar a `sri` real requiere RUC autorizado + firma .p12 (ver `docs/FACTURACION_ELECTRONICA.md`). |
| RF-13 | Liquidación de honorarios | ✅ | |
| RF-14 | Descargo automático de insumos | ✅ 🔧 | Se ejecuta al pasar a *Atendido* (por `/status` o por edición), una sola vez. |
| Fase 2 | Recetas odontológicas | ✅ 🔧 | **Nuevo módulo**: firma, numeración, cruce con alergias, anulación, impresión. |
| Roles | Signos vitales (Asistente) | ✅ 🔧 | **Nuevo módulo** con alertas clínicas automáticas. |
| Alcance | Almacenamiento de Rx, fotos y PDFs | ✅ 🔧 | **Nuevo módulo** de archivos en S3/MinIO. |

## Requerimientos no funcionales

| ID | Requerimiento | Estado | Observación |
|----|---------------|--------|-------------|
| RNF-01 | Expediente + odontograma < 1,5 s | ✅ 🔧 | Métricas por ruta (p95, % dentro de 1,5 s), `Server-Timing`, alertas de peticiones/consultas lentas, compresión, índices nuevos y prueba k6 con umbral. **Pendiente: ejecutar k6 en staging y archivar el resultado.** |
| RNF-02 | Uptime 99,9 % (07:00–21:00) | ✅ 🔧 | 2 réplicas tras nginx con failover, healthchecks, apagado ordenado, backups diarios cifrados, monitoreo sintético. El SLA real depende del hosting. |
| RNF-03 | 150 usuarios concurrentes | ✅ 🔧 | API sin estado (estado compartido en Redis), réplicas, pool de conexiones dimensionado, descuento de stock atómico, prueba k6 a 150 VUs. **Pendiente: ejecutar en staging.** |
| RNF-04 | TLS 1.3 y AES-256 en reposo | ✅ 🔧 | nginx solo TLS 1.3 + HSTS; S3 con SSE AES-256; respaldos cifrados AES-256. El disco de PostgreSQL debe ir cifrado en el servidor (LUKS / proveedor). |
| RNF-05 | RBAC | ✅ 🔧 | Registro público con rol arbitrario cerrado. Menú filtrado por rol. |
| RNF-05 | MFA obligatoria | ✅ 🔧 | `MfaGuard` global + enrolamiento con QR en el primer login; no se puede desactivar; reset por Admin TI. |
| RNF-05 | Cierre por 15 min de inactividad | ✅ 🔧 | Frontend, con aviso; logout revoca el token en Redis. |
| RNF-06 | Log inmutable con IP e ISO-8601 | ✅ 🔧 | Interceptor global (lecturas, cambios, descargas) + trigger de inmutabilidad. |
| RNF-07 | Responsive / tablet | ✅ 🔧 | |
| RNF-08 | Navegadores | ✅ | |

## Reglas de negocio

| ID | Regla | Estado | Observación |
|----|-------|--------|-------------|
| RN-01 | Nada “Realizado” se borra; correcciones por adenda | ✅ 🔧 | Adendas + triggers. Una cita *Atendida* no puede cancelarse, reprogramarse ni cambiar de estado. Recetas solo se anulan. |
| RN-02 | Cierre de caja ciego | ✅ 🔧 | **Corregido:** el rol Cajero podía ver el total teórico en `/billing/cash-summary`. |
| RN-03 | Sin solapamiento por sillón | ✅ 🔧 | También en las citas creadas desde presupuestos. |

## Arquitectura e integraciones

| Elemento | Estado | Observación |
|----------|--------|-------------|
| Web App / PWA (capa cliente, SRS §7) | ✅ 🔧 | Manifest, service worker propio, instalación en tablets/escritorio, aviso de actualización y página sin conexión; `/api` nunca en caché. El *portal PWA para pacientes* es alcance de Fase 2 (SRS §2.3). |
| PostgreSQL + Prisma | ✅ | 2 migraciones nuevas (auditoría inmutable; módulos clínicos + triggers RN-01). |
| Redis | ✅ 🔧 | Rate limiting, revocación de tokens, lock del cron, deduplicación, caché de catálogos. Fallback en memoria. |
| S3 / MinIO | ✅ 🔧 | Archivos del paciente con URLs firmadas. |
| API fiscal | ✅ 🔧 | SRI Ecuador (web services offline). |
| Pasarela de pagos | ✅ 🔧 | Payphone y Stripe (+ simulada para desarrollo), webhooks firmados, pagos idempotentes. |
| WhatsApp / Twilio / Email | ✅ | |

## Criterios de aceptación (8.2)

| Criterio | Estado | Observación |
|----------|--------|-------------|
| Cobertura ≥ 80 % en endpoints críticos | ✅ 🔧 | 30 suites / 266 pruebas sobre los servicios reales con Prisma simulado (≈ 93 % de líneas en los críticos); `npm run test:cov` falla si baja del 80 %. Ver nota abajo. |
| DAST/SAST sin Altas/Críticas | 🟡 🔧 | Revisión SAST manual: 1 alto (secreto JWT por defecto), 1 medio (`new Function`), 1 bajo (credenciales precargadas) → corregidos. CI con Semgrep, gitleaks y ZAP. Falta la primera corrida automática en GitHub y en staging. |
| OpenAPI / Swagger 3 | ✅ 🔧 | Tags, Bearer y esquemas de DTO. |

**Nota sobre cobertura:** el umbral se aplica a la lógica de los módulos críticos (servicios, guards,
interceptor, Redis, S3) listados en `backend/jest.config.js`. Los controladores son capas finas de
decoradores; los módulos de honorarios, reportes, fiscal (mock) e inventario (salvo el descargo RF-14)
no están dentro del umbral. `npm run test:cov:all` muestra la cobertura de todo `src/`.

## Otros hallazgos

- Credenciales reales en `backend/.env` (Twilio, Gmail) → reemplazadas por `.env.example`. **Rotarlas.**
- Desfase horario UTC en la agenda (Ecuador UTC−5) → corregido.
- Concurrencia de stock → corregido con descuento atómico (`UPDATE … WHERE quantity >= n`).
- El RIDE no incluye código de barras de la clave de acceso (se muestra en texto); se puede añadir si la clínica lo requiere.

## Pendientes operativos (requieren acceso a cuentas o servidores)

| # | Tarea | Estado | Qué quedó listo | Guía |
|---|-------|--------|-----------------|------|
| 1 | Rotar credenciales de Twilio y Gmail | ⏳ Dueño de las cuentas | Pasos exactos, gitleaks en CI, `.gitignore` | `docs/ROTACION_CREDENCIALES.md` |
| 2 | Facturación con el SRI | ✅ Simulado por defecto | Flujo completo simulado; real listo para cuando haya RUC + firma .p12 | `docs/FACTURACION_ELECTRONICA.md` |
| 3 | Cobro de punta a punta | ✅ Simulado · ⏳ Payphone | Pasarela simulada completa; pasos para el ambiente de pruebas de Payphone (Stripe no admite Ecuador) | `docs/PAGOS_EN_LINEA.md` |
| 4 | Prueba de carga en staging | ⏳ Requiere servidor | `seed-loadtest.ts` + `run-staging.sh` (login con MFA, k6, `REPORTE.md` automático) | `loadtest/README.md` |
| 5 | Hallazgos de Semgrep/ZAP | ✅ Revisión manual · ⏳ CI | 3 hallazgos corregidos; workflows listos | `docs/SECURITY_CHECKLIST.md` |
| 6 | Cifrar el disco de la BD | ⏳ Requiere servidor | Guía por tipo de hosting + `deploy/check-encryption.sh` | `docs/CIFRADO_DISCO.md` |
