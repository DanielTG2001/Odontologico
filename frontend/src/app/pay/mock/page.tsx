'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard } from 'lucide-react';

/** Pasarela simulada (solo desarrollo / UAT). No cobra dinero real. */
function MockInner() {
  const q = useSearchParams();
  const tx = q.get('tx') || '';
  const amount = Number(q.get('amount') || 0) / 100;
  const go = (outcome: string) => {
    window.location.href = `/pay/return?provider=mock&tx=${encodeURIComponent(tx)}&outcome=${outcome}`;
  };
  return (
    <div className="card space-y-5 p-7">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Pasarela de PRUEBA: no se cobra dinero real.</div>
      <div className="text-center">
        <div className="text-sm text-ink-500">Total a pagar</div>
        <div className="text-4xl font-bold">${amount.toFixed(2)}</div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="label">Número de tarjeta</label>
          <div className="relative">
            <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-10 font-mono" defaultValue="4242 4242 4242 4242" readOnly />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="input font-mono" defaultValue="12/30" readOnly />
          <input className="input font-mono" defaultValue="123" readOnly />
        </div>
      </div>
      <button onClick={() => go('ok')} className="btn-primary w-full py-3">Pagar ${amount.toFixed(2)}</button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => go('fail')} className="btn-secondary">Simular rechazo</button>
        <button onClick={() => go('cancel')} className="btn-secondary">Cancelar</button>
      </div>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense>
      <MockInner />
    </Suspense>
  );
}
