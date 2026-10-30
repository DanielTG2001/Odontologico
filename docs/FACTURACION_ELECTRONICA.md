# Facturación electrónica con el SRI (RF-12 / SRS 7.1)

SIGO-Dental emite **facturas electrónicas (codDoc 01, versión 1.1.0)** con el esquema *offline* del SRI de Ecuador.

## Modos

| `FISCAL_PROVIDER` | Qué hace | Cuándo |
|-------------------|----------|--------|
| `sri-simulado` (**por defecto**) | Mismo flujo que el real: secuencial, clave de acceso, XML 1.1.0, validaciones de recepción del SRI (estructura, clave, suma de pagos, consumidor final ≤ $50), autorización, RIDE con marca **SIMULACIÓN**. Sin firma ni conexión | Desarrollo, demos, UAT y mientras no exista RUC + firma |
| `sri` | Real: firma XAdES-BES con tu .p12 y envío al SRI (pruebas o producción) | Cuando la clínica tenga RUC autorizado y firma electrónica |
| `mock` | Timbrado mínimo heredado | Solo compatibilidad |

### ¿Se puede pasar a real?

Sí; el código ya está listo. Lo que falta no es programación, son **requisitos legales**:

1. **RUC** de la clínica (o del odontólogo como persona natural) con la obligación de facturar.
2. **Firma electrónica en archivo (.p12)** emitida por una entidad certificadora acreditada en Ecuador
   (Banco Central, Security Data, Uanataca, entre otras). Tiene costo y vigencia limitada.
3. Solicitar en **SRI en línea** el ambiente de **pruebas** de comprobantes electrónicos y, tras probar,
   el de **producción**.

Sin esos tres elementos el SRI rechaza el comprobante, así que **para un proyecto académico o una demo,
`sri-simulado` es la opción correcta**. El día que existan, solo se cambia `FISCAL_PROVIDER=sri` y los datos
del emisor; no se toca el código.

## Flujo

1. **Emitir** la factura en caja (estado `EMITIDA`, `PARCIAL` o `PAGADA`).
2. **Enviar al SRI** (botón en Facturación o `POST /api/fiscal/invoices/:id/stamp`):
   1. Secuencial atómico por establecimiento y punto de emisión (`fiscal_sequences`).
   2. Clave de acceso de 49 dígitos con dígito verificador módulo 11.
   3. XML con `infoTributaria`, `infoFactura`, `detalles` (descuento repartido por línea), `pagos` e `infoAdicional`.
   4. Firma **XAdES-BES** con tu firma electrónica `.p12` (librería `open-factura`).
   5. Envío a `RecepcionComprobantesOffline` → `RECIBIDA` / `DEVUELTA`.
   6. Consulta a `AutorizacionComprobantesOffline` → `AUTORIZADO` / `NO AUTORIZADO` / `EN PROCESAMIENTO`.
3. El XML autorizado se guarda en la base de datos y en S3 (`fiscal/<año>/<clave>.xml`) para la conservación de 7 años.
4. **RIDE** imprimible: `GET /api/fiscal/documents/:id/ride` · **XML**: `GET /api/fiscal/documents/:id/xml`.

| Estado | Qué significa | Qué hacer |
|--------|---------------|-----------|
| `AUTORIZADO` | Válido tributariamente | Entregar RIDE y XML al paciente |
| `PENDIENTE_ENVIO` | El SRI no respondió | Nada: se reintenta cada 10 min |
| `RECIBIDA` / `EN_PROCESAMIENTO` | El SRI aún no autoriza | Nada: se consulta cada 10 min (o botón *Consultar SRI*) |
| `DEVUELTA` / `NO_AUTORIZADO` | Error en datos o firma | Leer el mensaje, corregir y pulsar *Corregir y reenviar* (genera un nuevo secuencial) |

El código **43 (CLAVE ACCESO REGISTRADA)** se trata como recibido: pasa directo a autorización.
Un comprobante `AUTORIZADO` no se puede borrar ni modificar (trigger en PostgreSQL).

## Configuración

```env
FISCAL_PROVIDER=sri
SRI_AMBIENTE=1                     # 1 pruebas · 2 producción
SRI_RUC=1790012345001
SRI_RAZON_SOCIAL=CLINICA DENTAL EJEMPLO S.A.
SRI_NOMBRE_COMERCIAL=Sonrisas
SRI_DIR_MATRIZ=Av. Amazonas N34-56, Quito
SRI_ESTAB=001
SRI_PTO_EMI=001
SRI_OBLIGADO_CONTABILIDAD=SI
SRI_CONTRIBUYENTE_RIMPE=           # leyenda RIMPE si aplica
SRI_IVA_CODIGO=0                   # servicios de salud: 0 %
SRI_IVA_TARIFA=0
SRI_CERT_PATH=/run/secrets/firma.p12
SRI_CERT_PASSWORD=********
```

- **IVA:** los servicios de salud humana tienen tarifa 0 %. Si vendes productos gravados (p. ej. kits de blanqueamiento) usa `SRI_IVA_CODIGO=4` y `SRI_IVA_TARIFA=15`. El sistema verifica que el total calculado para el SRI coincida con la factura antes de firmar.
- **Comprador:** se toma del paciente. CI → `05` (se valida la cédula), RUC → `04`, Pasaporte → `06`, `9999999999999` → consumidor final `07`.
- **Formas de pago:** efectivo `01`, débito `16`, crédito `19`, transferencia/seguro `20`. El saldo pendiente se declara como `20` con plazo de 30 días.
- Las URLs del SRI se pueden sobrescribir con `SRI_RECEPTION_URL` y `SRI_AUTHORIZATION_URL`.

## Pasos para salir a producción

1. Obtener la firma electrónica (.p12) de una entidad certificadora autorizada.
2. En SRI en línea → *Comprobantes electrónicos* → solicitar el **ambiente de pruebas**.
3. Configurar `SRI_AMBIENTE=1`, emitir facturas de prueba y verificar que queden `AUTORIZADO`.
4. Solicitar el **ambiente de producción**, cambiar a `SRI_AMBIENTE=2` y fijar `SRI_SECUENCIAL_INICIAL`.
5. Fijar la versión de `open-factura` en `package-lock.json` tras la primera instalación.

> **Validación pendiente cuando haya RUC y firma:** la firma XAdES (open-factura) no se pudo probar contra el SRI real.
> Haz la prueba del paso 3 en el ambiente de pruebas antes de producción. Evidencia: RIDE con estado AUTORIZADO
> y ambiente PRUEBAS, y el XML descargado.
