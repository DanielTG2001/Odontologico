'use client';

import { useEffect } from 'react';
import { isStandalone, usePwa } from '@/lib/pwa-store';

/**
 * Registra el service worker y escucha los eventos de la PWA.
 * En desarrollo no se registra (interfiere con la recarga en caliente) salvo NEXT_PUBLIC_PWA_DEV=1.
 */
export function PwaRegister() {
  const { setInstallEvent, setInstalled, setOnline, setWaitingWorker } = usePwa();

  useEffect(() => {
    setInstalled(isStandalone());
    setOnline(navigator.onLine);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // mostramos nuestro propio botón "Instalar"
      setInstallEvent(e as any);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const enabled = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_PWA_DEV === '1';
    if (enabled && 'serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) setWaitingWorker(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            sw?.addEventListener('statechange', () => {
              // Hay una versión nueva lista y ya existía una anterior → ofrecer actualizar
              if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(sw);
            });
          });
          // Busca actualizaciones cada hora (equipos que quedan abiertos todo el día)
          const t = setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
          return () => clearInterval(t);
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setInstallEvent, setInstalled, setOnline, setWaitingWorker]);

  return null;
}
