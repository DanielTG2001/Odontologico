import type { MetadataRoute } from 'next';

/** Manifest de la PWA (se publica en /manifest.webmanifest) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'SIGO-Dental – Expediente clínico',
    short_name: 'SIGO-Dental',
    description: 'Sistema Integral de Gestión Odontológica: agenda, expediente, odontograma y facturación.',
    lang: 'es-EC',
    dir: 'ltr',
    start_url: '/dashboard?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    // Horizontal y vertical: tablets en el sillón (RNF-07)
    orientation: 'any',
    background_color: '#f5f7f6',
    theme_color: '#156f64',
    categories: ['medical', 'health', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Agenda', url: '/appointments?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Pacientes', url: '/patients?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Nuevo paciente', url: '/patients/new?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Facturación', url: '/billing?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
