'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Invoice, Patient } from '@/types';
import { cn } from '@/lib/utils';
import { Plus, Trash2, CreditCard } from 'lucide-react';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { ElectronicInvoicePanel } from '@/components/billing/ElectronicInvoicePanel';
import { OnlinePaymentPanel } from '@/components/billing/OnlinePaymentPanel';

type Line = { description: string; quantity: number; unitPrice: number };

const PAYMENT_METHODS = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA_CREDITO', label: 'T. Crédito' },
  { value: 'TARJETA_DEBITO', label: 'T. Débito' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'SEGURO', label: 'Seguro' },
];

function BillingInner() {
  const searchParams = useSearchParams();
  const prePatientId = searchParams.get('patientId') || '';

  const [patientId, setPatientId] = useState(prePatientId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [lines, setLines] = useState<Line[]>([
    { description: 'Consulta general', quantity: 1, unitPrice: 150 },
  ]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState('EFECTIVO');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Invoice[]>([]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [lines],
  );
  const total = Math.max(0, subtotal - discount + tax);

  useEffect(() => {
    if (prePatientId) loadPatient(prePatientId);
    loadRecent();
  }, [prePatientId]);

  async function openInvoice(id: string) {
    try {
      const inv = await api('/billing/invoices/' + id);
      setInvoice(inv);
      setMessage('');
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  const reloadInvoice = useCallback(async () => {
    if (!invoice?.id) return;
    try {
      const inv = await api('/billing/invoices/' + invoice.id);
      setInvoice((cur) => (cur && cur.status === inv.status && (cur.payments?.length || 0) === (inv.payments?.length || 0) ? cur : inv));
    } catch { /* ignore */ }
  }, [invoice?.id]);

  async function loadPatient(id: string) {
    try {
      const p = await api('/patients/' + id);
      setPatient(p);
      setPatientId(id);
    } catch {
      setPatient(null);
    }
  }

  async function loadRecent() {
    try {
      const data = await api('/billing/invoices');
      setRecent(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch {
      /* ignore */
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createInvoice() {
    if (!patientId) {
      setError('Indica el paciente');
      return;
    }
    if (lines.length === 0 || lines.some((l) => !l.description)) {
      setError('Completa los ítems de la factura');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const inv = await api('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          discount,
          tax,
          items: lines,
        }),
      });
      setInvoice(inv);
      setMessage('Factura creada en borrador: ' + inv.number);
      loadRecent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice() {
    if (!invoice) return;
    setBusy(true);
    try {
      const inv = await api('/billing/invoices/' + invoice.id + '/issue', { method: 'PATCH' });
      setInvoice(inv);
      setMessage('Factura emitida: ' + inv.number);
      setPayAmount(String(Number(inv.total)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addPayment() {
    if (!invoice) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setError('Monto inválido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const inv = await api('/billing/invoices/' + invoice.id + '/payments', {
        method: 'POST',
        body: JSON.stringify({
          method: payMethod,
          amount,
          reference: payRef || undefined,
        }),
      });
      setInvoice(inv);
      setMessage('Pago registrado. Estado: ' + inv.status);
      setPayAmount('');
      setPayRef('');
      loadRecent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Punto de venta / Facturación</h1>
        <p className="page-subtitle">Crear factura, emitir y registrar pagos mixtos</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: build invoice */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Paciente</label>
              <div className="flex gap-2">
                <PatientPicker value={patientId} onChange={setPatientId} onPick={(p) => loadPatient(p.id)} className="flex-1" />
                <button
                  type="button"
                  onClick={() => loadPatient(patientId)}
                  className="btn-secondary"
                >
                  Cargar
                </button>
              </div>
              {patient && (
                <p className="mt-2 text-sm text-ink-600">
                  <strong>{patient.firstName} {patient.lastName}</strong>
                  {' · '}{patient.documentType} {patient.documentNumber}
                  {patient.medicalHistory?.hasCriticalAlert && (
                    <span className="ml-2 text-red-600 font-medium">⚠ Alerta médica</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-ink-700">Ítems</label>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-sm text-clinical-600 hover:underline">
                  <Plus className="h-4 w-4" /> Agregar
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-5 rounded-lg border border-ink-300 px-2 py-1.5 text-sm"
                      placeholder="Descripción"
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      className="col-span-2 rounded-lg border border-ink-300 px-2 py-1.5 text-sm"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 1 })}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="col-span-3 rounded-lg border border-ink-300 px-2 py-1.5 text-sm"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) || 0 })}
                    />
                    <div className="col-span-1 text-right text-sm text-ink-600">
                      {(line.quantity * line.unitPrice).toFixed(0)}
                    </div>
                    <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-ink-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">Descuento</label>
                <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="input" />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">Impuesto</label>
                <input type="number" min={0} value={tax} onChange={(e) => setTax(Number(e.target.value) || 0)} className="input" />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-ink-100 pt-4">
              <div className="text-sm text-ink-500">
                Subtotal {subtotal.toFixed(2)}
              </div>
              <div className="text-xl font-semibold text-ink-900">Total {total.toFixed(2)}</div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={createInvoice}
              className="w-full rounded-lg bg-clinical-600 hover:bg-clinical-700 text-white font-medium py-2.5 text-sm disabled:opacity-50"
            >
              Crear factura (borrador)
            </button>
          </div>
        </div>

        {/* Right: current invoice + pay */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-ink-900 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-clinical-600" />
              Factura actual
            </h2>
            {!invoice ? (
              <p className="text-sm text-ink-400">Crea una factura para emitir y cobrar</p>
            ) : (
              <>
                <div className="text-sm space-y-1">
                  <div><span className="text-ink-500">Número:</span> <strong>{invoice.number}</strong></div>
                  <div>
                    <span className="text-ink-500">Estado:</span>{' '}
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      invoice.status === 'PAGADA' && 'bg-emerald-100 text-emerald-800',
                      invoice.status === 'EMITIDA' && 'bg-sky-100 text-sky-800',
                      invoice.status === 'BORRADOR' && 'bg-ink-100 text-ink-700',
                      invoice.status === 'PARCIAL' && 'bg-amber-100 text-amber-800',
                    )}>
                      {invoice.status}
                    </span>
                  </div>
                  <div><span className="text-ink-500">Total:</span> {Number(invoice.total).toFixed(2)}</div>
                  {invoice.payments && invoice.payments.length > 0 && (
                    <div className="pt-2 border-t border-ink-100 mt-2">
                      <div className="text-xs text-ink-500 mb-1">Pagos</div>
                      {invoice.payments.map((p, i) => (
                        <div key={i} className="text-xs">
                          {p.method}: {Number(p.amount).toFixed(2)}
                          {p.reference && ` (${p.reference})`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {invoice.status === 'BORRADOR' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={issueInvoice}
                    className="w-full rounded-lg border border-clinical-600 text-clinical-700 font-medium py-2 text-sm hover:bg-clinical-50"
                  >
                    Emitir factura
                  </button>
                )}

                <ElectronicInvoicePanel invoice={invoice} onChange={(inv) => setInvoice((cur) => (cur ? { ...cur, ...inv } : inv))} />

                {(invoice.status === 'EMITIDA' || invoice.status === 'PARCIAL') && (
                  <div className="space-y-2 border-t border-ink-100 pt-3">
                    <div className="text-xs font-medium text-ink-500">Registrar pago</div>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="input"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Referencia / voucher (opcional)"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      className="input"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={addPayment}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 text-sm"
                    >
                      Cobrar
                    </button>
                  </div>
                )}

                <OnlinePaymentPanel
                  invoice={invoice}
                  remaining={Math.max(0, Number(invoice.total) - (invoice.payments || []).reduce((a, p) => a + Number(p.amount), 0))}
                  onPaid={reloadInvoice}
                />
              </>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-3">Facturas recientes</h3>
            {recent.length === 0 ? (
              <p className="text-xs text-ink-400">Sin facturas</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((inv) => (
                  <li key={inv.id} onClick={() => openInvoice(inv.id)} className="flex cursor-pointer justify-between rounded px-1 text-xs border-b border-ink-50 pb-1.5 hover:bg-clinical-50/50">
                    <span>
                      <strong>{inv.number}</strong>
                      {inv.patient && (
                        <span className="text-ink-500"> · {inv.patient.firstName} {inv.patient.lastName}</span>
                      )}
                    </span>
                    <span className="text-ink-600">{Number(inv.total).toFixed(0)} · {inv.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="text-ink-400 p-8">Cargando…</div>}>
      <BillingInner />
    </Suspense>
  );
}
