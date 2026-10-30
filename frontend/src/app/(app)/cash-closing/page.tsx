'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Wallet } from 'lucide-react';

/**
 * RN-02: Cierre de caja ciego
 * El cajero SOLO ve campos de conteo físico.
 * Los totales del sistema NO se muestran antes de enviar.
 * Tras guardar, la API devuelve la diferencia.
 */

interface Closing {
  id: string;
  closingDate: string;
  countedCash: number;
  countedCard: number;
  countedTransfer: number;
  countedOther: number;
  systemTotal?: number;
  difference?: number;
  status: string;
  closedAt?: string;
  closedBy?: { firstName: string; lastName: string };
}

export default function CashClosingPage() {
  const user = useAuthStore((s) => s.user);
  const isAuditor =
    user?.role === 'ADMIN_TI' || user?.role === 'AUDITOR' || user?.role === 'CONTADOR';

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [countedCash, setCountedCash] = useState('');
  const [countedCard, setCountedCard] = useState('');
  const [countedTransfer, setCountedTransfer] = useState('');
  const [countedOther, setCountedOther] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<Closing | null>(null);
  const [history, setHistory] = useState<Closing[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const data = await api('/cash-closing');
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }

  async function loadPreview() {
    if (!isAuditor) return;
    try {
      const data = await api('/cash-closing/system-preview?date=' + date);
      setPreview(data);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const closing = await api('/cash-closing', {
        method: 'POST',
        body: JSON.stringify({
          closingDate: date,
          countedCash: Number(countedCash) || 0,
          countedCard: Number(countedCard) || 0,
          countedTransfer: Number(countedTransfer) || 0,
          countedOther: Number(countedOther) || 0,
          notes: notes || undefined,
        }),
      });
      setResult(closing);
      setCountedCash('');
      setCountedCard('');
      setCountedTransfer('');
      setCountedOther('');
      setNotes('');
      loadHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const countedTotal =
    (Number(countedCash) || 0) +
    (Number(countedCard) || 0) +
    (Number(countedTransfer) || 0) +
    (Number(countedOther) || 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 flex items-center gap-2">
          <Wallet className="h-7 w-7 text-clinical-600" />
          Cierre de caja
        </h1>
        <p className="page-subtitle">
          Cierre <strong>ciego</strong> (RN-02): ingresa solo el conteo físico. El sistema calcula la diferencia después.
        </p>
      </div>

      {error && (
        <div className="alert-error">{error}</div>
      )}

      <form onSubmit={submit} className="card p-5 space-y-4">
        <div>
          <label className="label">Fecha de cierre</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-ink-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          No se muestran los totales teóricos del sistema hasta que confirmes el conteo.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Efectivo contado *</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Tarjetas contadas</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={countedCard}
              onChange={(e) => setCountedCard(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Transferencias</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={countedTransfer}
              onChange={(e) => setCountedTransfer(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Otros</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={countedOther}
              onChange={(e) => setCountedOther(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="text-sm text-ink-600">
          Total contado (solo tu suma): <strong>{countedTotal.toFixed(2)}</strong>
        </div>

        <div>
          <label className="label">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="input"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-clinical-600 hover:bg-clinical-700 text-white font-medium py-2.5 text-sm disabled:opacity-50"
        >
          {busy ? 'Cerrando…' : 'Confirmar cierre de caja'}
        </button>
      </form>

      {/* Result AFTER submit — here system totals appear */}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
          <h2 className="font-semibold text-emerald-900">Cierre registrado</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Total sistema:</div>
            <div className="font-medium">{Number(result.systemTotal ?? 0).toFixed(2)}</div>
            <div>Tu conteo:</div>
            <div className="font-medium">
              {(
                Number(result.countedCash) +
                Number(result.countedCard) +
                Number(result.countedTransfer) +
                Number(result.countedOther)
              ).toFixed(2)}
            </div>
            <div>Diferencia:</div>
            <div
              className={
                Number(result.difference) === 0
                  ? 'font-bold text-emerald-700'
                  : 'font-bold text-red-700'
              }
            >
              {Number(result.difference ?? 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Solo admin/auditor/contador */}
      {isAuditor && (
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-ink-900 text-sm">Vista previa sistema (solo auditoría)</h2>
          <button
            type="button"
            onClick={loadPreview}
            className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs hover:bg-ink-50"
          >
            Ver totales del sistema para {date}
          </button>
          {preview && (
            <pre className="text-xs bg-ink-50 rounded p-3 overflow-auto">{JSON.stringify(preview, null, 2)}</pre>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 font-semibold text-sm">Historial reciente</div>
        {history.length === 0 ? (
          <p className="p-4 text-sm text-ink-400">Sin cierres</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-600">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-right px-4 py-2">Sistema</th>
                <th className="text-right px-4 py-2">Diferencia</th>
                <th className="text-left px-4 py-2">Cajero</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-ink-50">
                  <td className="px-4 py-2">{String(h.closingDate).slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right">{Number(h.systemTotal ?? 0).toFixed(2)}</td>
                  <td
                    className={
                      'px-4 py-2 text-right font-medium ' +
                      (Number(h.difference) === 0 ? 'text-emerald-600' : 'text-red-600')
                    }
                  >
                    {Number(h.difference ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    {h.closedBy ? h.closedBy.firstName + ' ' + h.closedBy.lastName : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
