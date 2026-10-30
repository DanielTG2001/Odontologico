'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { usePwa } from '@/lib/pwa-store';

/** Avisos de la PWA dentro de la app: sin conexión y nueva versión disponible */
export function PwaBanners() {
  const { online, waitingWorker, applyUpdate } = usePwa();
  return (
    <>
      {!online && (
        <div role="status" className="sticky top-14 z-20 flex items-center justify-center gap-2 bg-ink-800 px-4 py-2 text-sm text-white">
          <WifiOff className="h-4 w-4" /> Sin conexión. Los cambios no se guardarán hasta recuperar internet.
        </div>
      )}
      {waitingWorker && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-clinical-950 px-4 py-3 text-sm text-white shadow-2xl">
          Hay una nueva versión de SIGO-Dental.
          <button onClick={applyUpdate} className="inline-flex items-center gap-1.5 rounded-lg bg-clinical-500 px-3 py-1.5 font-semibold hover:bg-clinical-400">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      )}
    </>
  );
}
