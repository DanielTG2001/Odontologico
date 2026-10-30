'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, FileCode2, FileText, Loader2, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { api, openAuthed } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Doc {
  id: string;
  accessKey: string;
  estab: string;
  ptoEmi: string;
  sequential: string;
  environment: string;
  status: string;
  authorizationNumber?: string;
  authorizationDate?: string;
  messages?: { identificador?: string; mensaje: string; informacionAdicional?: string; tipo?: string }[];
  attempts: number;
  createdAt: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  AUTORIZADO: { label: 'Autorizado por el SRI', cls: 'bg-emerald-100 text-emerald-800' },
  RECIBIDA: { label: 'Recibida, esperando autorización', cls: 'bg-sky-100 text-sky-800' },
  EN_PROCESAMIENTO: { label: 'En procesamiento (SRI)', cls: 'bg-sky-100 text-sky-800' },
  FIRMADO: { label: 'Firmado, pendiente de envío', cls: 'bg-ink-100 text-ink-700' },
  PENDIENTE_ENVIO: { label: 'SRI no disponible: se reintenta solo', cls: 'bg-amber-100 text-amber-800' },
  DEVUELTA: { label: 'Devuelta por el SRI', cls: 'bg-red-100 text-red-700' },
  NO_AUTORIZADO: { label: 'No autorizado', cls: 'bg-red-100 text-red-700' },
};

export function ElectronicInvoicePanel({ invoice, onChange }: { invoice: { id: string; status: string; number: string }; onChange?: (inv: any) => void }) {
  const [provider, setProvider] = useState<{ provider: string; environment: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mockMsg, setMockMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [cfg, list] = await Promise.all([api('/fiscal/config'), api(`/fiscal/invoices/${invoice.id}/documents`)]);
      setProvider(cfg);
      setDocs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [invoice.id]);

  useEffect(() => { load(); }, [load]);

  // Mientras esté en tránsito, refresca cada 10 s
  const current = docs[0];
  useEffect(() => {
    if (!current || !['RECIBIDA', 'EN_PROCESAMIENTO', 'PENDIENTE_ENVIO', 'FIRMADO'].includes(current.status)) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [current, load]);

  if (!['EMITIDA', 'PARCIAL', 'PAGADA'].includes(invoice.status)) return null;

  async function send() {
    setBusy(true);
    setError('');
    setMockMsg('');
    try {
      const res = await api(`/fiscal/invoices/${invoice.id}/stamp`, { method: 'POST' });
      if (res.invoice) onChange?.(res.invoice);
      if (res.stamp) setMockMsg(`Timbrado simulado: ${res.stamp.uuid}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/fiscal/documents/${id}/retry`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const st = current ? STATUS[current.status] || { label: current.status, cls: 'bg-ink-100' } : null;
  const canResend = !current || ['DEVUELTA', 'NO_AUTORIZADO'].includes(current.status);
  const resumable = current && ['FIRMADO', 'PENDIENTE_ENVIO', 'RECIBIDA', 'EN_PROCESAMIENTO'].includes(current.status);

  return (
    <div className="space-y-3 border-t border-ink-100 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Factura electrónica</div>
        {provider && (
          <span
            className={cn('chip', provider.provider === 'sri' ? (provider.environment === 'PRODUCCION' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800') : 'bg-ink-100 text-ink-600')}
            title={provider.provider === 'sri' ? undefined : 'Sin firma electrónica ni conexión con el SRI: los comprobantes no tienen validez tributaria'}
          >
            {provider.provider === 'sri' ? `SRI · ${provider.environment}` : provider.provider === 'sri-simulado' ? 'SRI simulado' : 'Simulado'}
          </span>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {mockMsg && <div className="alert-success">{mockMsg}</div>}

      {current && st && (
        <div className="space-y-2 rounded-lg border border-ink-100 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('chip', st.cls)}>
              {current.status === 'AUTORIZADO' ? <BadgeCheck className="h-3 w-3" /> : null} {st.label}
            </span>
            <span className="font-mono text-ink-500">{current.estab}-{current.ptoEmi}-{current.sequential}</span>
          </div>
          <div>
            <div className="text-ink-400">Clave de acceso</div>
            <div className="break-all font-mono text-[11px] text-ink-700">{current.accessKey}</div>
          </div>
          {current.authorizationDate && (
            <div className="text-ink-500">Autorizada: {new Date(current.authorizationDate).toLocaleString('es-EC')}</div>
          )}
          {!!current.messages?.length && current.status !== 'AUTORIZADO' && (
            <ul className="space-y-1">
              {current.messages.map((m, i) => (
                <li key={i} className="flex gap-1.5 text-red-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{m.identificador ? `[${m.identificador}] ` : ''}{m.mensaje}{m.informacionAdicional ? ` – ${m.informacionAdicional}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={() => openAuthed(`/fiscal/documents/${current.id}/ride`).catch((e) => setError(e.message))} className="btn-secondary px-2.5 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" /> RIDE
            </button>
            <button type="button" onClick={() => openAuthed(`/fiscal/documents/${current.id}/xml`, { download: `${current.accessKey}.xml` }).catch((e) => setError(e.message))} className="btn-secondary px-2.5 py-1.5 text-xs">
              <FileCode2 className="h-3.5 w-3.5" /> XML
            </button>
            {resumable && (
              <button type="button" disabled={busy} onClick={() => retry(current.id)} className="btn-secondary px-2.5 py-1.5 text-xs">
                <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Consultar SRI
              </button>
            )}
          </div>
        </div>
      )}

      {canResend && (
        <button type="button" disabled={busy} onClick={send} className="btn-secondary w-full border-violet-300 text-violet-700 hover:bg-violet-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {current ? 'Corregir y reenviar al SRI' : provider?.provider === 'sri' ? 'Enviar al SRI' : provider?.provider === 'sri-simulado' ? 'Enviar al SRI (simulado)' : 'Timbrar (simulado)'}
        </button>
      )}
    </div>
  );
}
