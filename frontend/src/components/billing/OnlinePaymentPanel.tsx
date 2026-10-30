'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-100 text-ink-600',
  EXPIRED: 'bg-ink-100 text-ink-500',
};
const LABEL: Record<string, string> = { PENDING: 'Pendiente', PAID: 'Pagado', FAILED: 'Fallido', CANCELLED: 'Cancelado', EXPIRED: 'Vencido' };
const PROVIDER: Record<string, string> = { payphone: 'Payphone', stripe: 'Stripe', mock: 'Simulado' };

export function OnlinePaymentPanel({ invoice, remaining, onPaid }: { invoice: { id: string; status: string }; remaining: number; onPaid?: () => void }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState('');
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [sendVia, setSendVia] = useState<'none' | 'whatsapp' | 'email'>('whatsapp');
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api(`/payments/online/invoice/${invoice.id}`);
      setList(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.some((p: any) => p.status === 'PAID') && onPaid) onPaid();
    } catch { /* sin permiso */ }
  }, [invoice.id, onPaid]);

  useEffect(() => {
    api('/payments/providers')
      .then((r) => { setProviders(r.enabled || []); setProvider(r.default || r.enabled?.[0] || ''); })
      .catch(() => setProviders([]));
    load();
  }, [load]);

  useEffect(() => setAmount(remaining.toFixed(2)), [remaining]);

  // Mientras haya un cobro pendiente, consulta cada 5 s
  const hasPending = list.some((p) => p.status === 'PENDING');
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [hasPending, load]);

  if (!['EMITIDA', 'PARCIAL'].includes(invoice.status) || providers.length === 0) return null;

  async function create() {
    setBusy(true);
    setError('');
    try {
      const res = await api('/payments/online', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invoice.id, amount: Number(amount), provider, sendVia }),
      });
      await load();
      if (sendVia === 'none' && res.checkoutUrl) window.open(res.checkoutUrl, '_blank', 'noopener');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-ink-100 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Cobro en línea</div>
        <button type="button" onClick={load} className="text-ink-400 hover:text-ink-700" aria-label="Actualizar"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input">
          {providers.map((p) => <option key={p} value={p}>{PROVIDER[p] || p}</option>)}
        </select>
        <input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
      </div>
      <select value={sendVia} onChange={(e) => setSendVia(e.target.value as any)} className="input">
        <option value="whatsapp">Enviar enlace por WhatsApp</option>
        <option value="email">Enviar enlace por email</option>
        <option value="none">Abrir aquí (paciente presente)</option>
      </select>
      <button type="button" disabled={busy || !provider} onClick={create} className="btn-primary w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Generar enlace de pago
      </button>

      {list.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {list.slice(0, 5).map((p) => (
            <li key={p.id} className="rounded-lg border border-ink-100 px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span>{PROVIDER[p.provider] || p.provider} · ${Number(p.amount).toFixed(2)}</span>
                <span className={cn('chip', STATUS[p.status])}>{LABEL[p.status] || p.status}</span>
              </div>
              {p.status === 'PAID' && <div className="mt-1 text-ink-500">{p.cardBrand} ****{p.cardLast4} · Aut. {p.authorizationCode}</div>}
              {p.status === 'PENDING' && p.checkoutUrl && (
                <div className="mt-1.5 flex gap-1.5">
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(p.checkoutUrl); setCopied(p.id); }} className="btn-secondary px-2 py-1 text-[11px]">
                    <Copy className="h-3 w-3" /> {copied === p.id ? 'Copiado' : 'Copiar enlace'}
                  </button>
                  <a href={p.checkoutUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-2 py-1 text-[11px]"><ExternalLink className="h-3 w-3" /> Abrir</a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
