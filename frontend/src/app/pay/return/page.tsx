'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Result {
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  invoiceNumber: string;
  cardBrand?: string;
  cardLast4?: string;
  authorizationCode?: string;
  checkoutUrl?: string;
}

function ReturnInner() {
  const q = useSearchParams();
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const provider = q.get('provider') || '';
    const params: Record<string, string> = {};
    q.forEach((v, k) => { if (k !== 'provider') params[k] = v; });
    // Payphone exige confirmar en menos de 5 minutos: se hace apenas carga la página
    api('/payments/public/confirm', { method: 'POST', body: JSON.stringify({ provider, params }) })
      .then(setRes)
      .catch((e) => setError(e.message));
  }, [q]);

  if (error) {
    return (
      <div className="card p-8 text-center">
        <XCircle className="mx-auto h-12 w-12 text-red-500" />
        <h1 className="mt-3 text-xl font-bold">No pudimos verificar el pago</h1>
        <p className="mt-2 text-sm text-ink-500">{error}</p>
        <p className="mt-4 text-sm text-ink-500">Si se debitó el valor, comunícate con la clínica con este código: <span className="font-mono">{q.get('tx') || q.get('clientTransactionId')}</span></p>
      </div>
    );
  }
  if (!res) {
    return (
      <div className="card p-8 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-clinical-600" />
        <p className="mt-3 text-sm text-ink-500">Confirmando tu pago…</p>
      </div>
    );
  }

  const ok = res.status === 'PAID';
  const pending = res.status === 'PENDING';
  return (
    <div className="card p-8 text-center">
      {ok ? <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" /> : pending ? <Clock className="mx-auto h-14 w-14 text-amber-500" /> : <XCircle className="mx-auto h-14 w-14 text-red-500" />}
      <h1 className="mt-3 text-2xl font-bold text-ink-900">
        {ok ? '¡Pago realizado!' : pending ? 'Pago en proceso' : res.status === 'CANCELLED' ? 'Pago cancelado' : 'El pago no se completó'}
      </h1>
      <p className="mt-1 text-sm text-ink-500">Factura {res.invoiceNumber}</p>
      <div className="my-6 text-4xl font-bold tracking-tight text-ink-900">${res.amount.toFixed(2)}</div>
      {ok && (
        <dl className="mx-auto max-w-xs space-y-1 text-left text-sm">
          {res.cardBrand && <div className="flex justify-between"><dt className="text-ink-500">Tarjeta</dt><dd>{res.cardBrand} ****{res.cardLast4}</dd></div>}
          {res.authorizationCode && <div className="flex justify-between"><dt className="text-ink-500">Autorización</dt><dd className="font-mono">{res.authorizationCode}</dd></div>}
        </dl>
      )}
      {!ok && res.checkoutUrl && (
        <a href={res.checkoutUrl} className="btn-primary mt-2">Intentar de nuevo</a>
      )}
      <p className="mt-6 text-xs text-ink-400">Puedes cerrar esta ventana.</p>
    </div>
  );
}

export default function PayReturnPage() {
  return (
    <Suspense>
      <ReturnInner />
    </Suspense>
  );
}
