# SIGO-Dental como PWA (Progressive Web App)

La arquitectura del SRS (sección 7) define la capa cliente como **Web App / PWA**. El sistema se puede
**instalar** en tablets del sillón, laptops y escritorio, y se abre en su propia ventana, sin barra del navegador.

## Instalar

| Dispositivo | Cómo |
|-------------|------|
| Chrome / Edge (Windows, Android, ChromeOS) | Botón **Instalar app** en el menú lateral (o el ícono de instalar en la barra de direcciones) |
| iPad / iPhone (Safari) | **Instalar app** muestra los pasos: *Compartir → Agregar a pantalla de inicio* |
| Firefox escritorio | No soporta instalación; funciona igual como web |

Requisito: servirse por **HTTPS** (en desarrollo, `localhost` también vale).

## Qué incluye

- `app/manifest.ts` → `/manifest.webmanifest`: nombre, colores, íconos normales y *maskable*, accesos directos
  (Agenda, Pacientes, Nuevo paciente, Facturación) y orientación libre para tablets.
- `public/sw.js`: service worker propio (sin dependencias).
- Aviso **"Hay una nueva versión – Actualizar"** al desplegar cambios.
- Indicador **Sin conexión** dentro de la app y página `offline.html`.

## Política de caché (datos de salud)

| Recurso | Estrategia |
|---------|-----------|
| `/api/*` (pacientes, expedientes, facturas…) | **Nunca en caché**: siempre red |
| `/pay/*` (pagos del paciente) | Siempre red |
| `/_next/static/*` (JS/CSS con hash) | Caché primero |
| Íconos y fuentes | Caché + actualización en segundo plano |
| Páginas | Red primero; sin conexión, última versión de la "cáscara" (sin datos) u `offline.html` |

Al **cerrar sesión** se borran las páginas guardadas. Así, en un equipo compartido de la clínica no queda
información de pacientes en el dispositivo (Ley de Protección de Datos Personales).

> No hay modo sin conexión para trabajar con expedientes: sería necesario guardar datos clínicos en el
> dispositivo, cifrarlos y resolver conflictos de sincronización. Si se requiere, es trabajo de una fase futura.

## Desarrollo

El service worker solo se registra en producción (`npm run build && npm start`), porque en `npm run dev`
interfiere con la recarga en caliente. Para probarlo en desarrollo: `NEXT_PUBLIC_PWA_DEV=1`.

Para publicar una versión que borre las cachés antiguas, sube `VERSION` en `public/sw.js`
(los archivos JS/CSS ya cambian de nombre en cada build).

## Verificación

Chrome DevTools → *Application* → *Manifest* (sin errores de instalación) y *Service Workers* (activado).
Lighthouse → categoría *PWA / Installable*.
