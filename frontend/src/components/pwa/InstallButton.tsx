'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { isIos, usePwa } from '@/lib/pwa-store';
import { cn } from '@/lib/utils';

/** Botón "Instalar app". En iPhone/iPad (sin aviso de instalación) muestra las instrucciones. */
export function InstallButton({ className }: { className?: string }) {
  const { installEvent, installed, install } = usePwa();
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => setIos(isIos()), []);

  if (installed || (!installEvent && !ios)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (installEvent ? install() : setShowIosHelp(true))}
        className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm', className)}
      >
        <Download className="h-4 w-4" /> Instalar app
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/40 p-4 sm:items-center" onClick={() => setShowIosHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold">Instalar en iPad / iPhone</h3>
              <button onClick={() => setShowIosHelp(false)} className="text-ink-400" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-ink-700">
              <li className="flex gap-2"><span className="font-bold text-clinical-700">1.</span> Abre SIGO-Dental en <b>Safari</b>.</li>
              <li className="flex gap-2"><span className="font-bold text-clinical-700">2.</span> Toca <Share className="inline h-4 w-4" /> <b>Compartir</b>.</li>
              <li className="flex gap-2"><span className="font-bold text-clinical-700">3.</span> Elige <b>Agregar a pantalla de inicio</b>.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
