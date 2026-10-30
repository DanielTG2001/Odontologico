'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { BadgePercent, Check, X } from 'lucide-react';
import { PatientPicker } from '@/components/patients/PatientPicker';

interface Procedure {
  id: string;
  name: string;
  code: string;
  basePrice: number;
}

interface PlanItem {
  id: string;
  procedureId: string;
  quantity: number;
  unitPrice: number;
  labCost: number;
  discount: number;
  phase: number;
  isApproved: boolean;
  procedure?: { name: string; code: string };
}

interface Plan {
  id: string;
  title?: string;
  status: string;
  totalAmount: number;
  discount?: number;
  discountStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  discountReason?: string;
  discountReviewNote?: string;
  items: PlanItem[];
}

const DISCOUNT_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Descuento por autorizar', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Descuento autorizado', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Descuento rechazado', cls: 'bg-red-100 text-red-700' },
};
const APPROVER_ROLES = ['ADMIN_TI', 'ODONTOLOGO', 'ESPECIALISTA'];

type Line = { procedureId: string; quantity: number; unitPrice: number; labCost: number; discount: number; phase: number };
const EMPTY_LINE: Line = { procedureId: '', quantity: 1, unitPrice: 0, labCost: 0, discount: 0, phase: 1 };

export default function TreatmentsPage() {
  const [patientId, setPatientId] = useState('');
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [title, setTitle] = useState('Plan de tratamiento');
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [planDiscount, setPlanDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [pending, setPending] = useState<any[]>([]);
  const user = useAuthStore((s) => s.user);
  const isApprover = !!user && APPROVER_ROLES.includes(user.role);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [chairs, setChairs] = useState<any[]>([]);
  const [approvePlanId, setApprovePlanId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [chairId, setChairId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/procedures').then((p) => setProcedures(Array.isArray(p) ? p : [])).catch(() => {});
    Promise.all([
      api('/auth/users?role=ODONTOLOGO').catch(() => []),
      api('/auth/users?role=ESPECIALISTA').catch(() => []),
      api('/chairs').catch(() => []),
    ]).then(([a, b, c]) => {
      const m = new Map([...a, ...b].map((d: any) => [d.id, d]));
      setDoctors([...m.values()]);
      setChairs(Array.isArray(c) ? c : []);
    });
  }, []);

  const loadPending = useCallback(async () => {
    if (!isApprover) return;
    try {
      const data = await api('/treatments/discounts/pending');
      setPending(Array.isArray(data) ? data : []);
    } catch { /* sin permiso */ }
  }, [isApprover]);

  useEffect(() => { loadPending(); }, [loadPending]);

  async function reviewDiscount(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt('Motivo del rechazo:') || '';
    if (!approve && !note.trim()) return;
    try {
      await api(`/treatments/${id}/discount/review`, { method: 'POST', body: JSON.stringify({ approve, note }) });
      setMessage(approve ? 'Descuento autorizado' : 'Descuento rechazado');
      loadPending();
      loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const grossTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity + l.labCost, 0);
  const totalDiscount = planDiscount + lines.reduce((s, l) => s + (l.discount || 0), 0);

  async function loadPlans() {
    if (!patientId.trim()) return;
    try {
      const data = await api('/treatments/patient/' + patientId.trim());
      setPlans(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function setLine(i: number, patch: any) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onProcChange(i: number, procedureId: string) {
    const p = procedures.find((x) => x.id === procedureId);
    setLine(i, { procedureId, unitPrice: p ? Number(p.basePrice) : 0 });
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId.trim() || lines.some((l) => !l.procedureId)) {
      setError('Paciente e ítems con procedimiento son obligatorios');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/treatments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patientId.trim(),
          title,
          items: lines.map((l) => ({ ...l, discount: l.discount || undefined })),
          discount: planDiscount || undefined,
          discountReason: totalDiscount > 0 ? discountReason : undefined,
        }),
      });
      setMessage(totalDiscount > 0 ? 'Presupuesto creado: el descuento queda pendiente de autorización (RF-07)' : 'Presupuesto creado');
      setPlanDiscount(0);
      setDiscountReason('');
      loadPlans();
      loadPending();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendPlan(id: string) {
    try {
      await api('/treatments/' + id + '/send', { method: 'PATCH' });
      setMessage('Enviado al paciente');
      loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function approve(createAppointments: boolean) {
    if (!approvePlanId || selectedItems.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await api('/treatments/' + approvePlanId + '/approve', {
        method: 'POST',
        body: JSON.stringify({
          itemIds: selectedItems,
          createAppointments,
          doctorId: createAppointments ? doctorId : undefined,
          chairId: createAppointments ? chairId : undefined,
          startAt: createAppointments && startAt ? new Date(startAt).toISOString() : undefined,
          slotMinutes: 30,
        }),
      });
      setMessage(
        'Aprobado' +
          (res.appointmentsCreated?.length
            ? ` · ${res.appointmentsCreated.length} cita(s) creadas`
            : ''),
      );
      setApprovePlanId(null);
      setSelectedItems([]);
      loadPlans();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Planes y presupuestos</h1>
        <p className="page-subtitle">Multinivel por fases · aprobación parcial/total · generación de citas (RF-07 / RF-08)</p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Paciente</label>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
        <button type="button" onClick={loadPlans} className="btn-secondary">Ver planes</button>
      </div>

      {isApprover && pending.length > 0 && (
        <div className="card space-y-3 border-amber-200 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><BadgePercent className="h-4 w-4 text-amber-600" /> Descuentos por autorizar ({pending.length})</h2>
          <ul className="divide-y divide-ink-100">
            {pending.map((p) => {
              const gross = p.items.reduce((s: number, i: any) => s + Number(i.unitPrice) * i.quantity + Number(i.labCost), 0);
              const disc = Number(p.discount) + p.items.reduce((s: number, i: any) => s + Number(i.discount), 0);
              const own = p.createdBy?.id === user?.id;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">{p.patient?.firstName} {p.patient?.lastName} · {p.title}</div>
                    <div className="text-xs text-ink-500">
                      Descuento ${disc.toFixed(2)} ({gross ? ((disc / gross) * 100).toFixed(1) : 0} %) · Total ${Number(p.totalAmount).toFixed(2)} · Solicitado por {p.createdBy?.firstName} {p.createdBy?.lastName}
                    </div>
                    {p.discountReason && <div className="text-xs italic text-ink-500">Motivo: {p.discountReason}</div>}
                  </div>
                  {own ? (
                    <span className="text-xs text-ink-400">Lo debe autorizar otro profesional</span>
                  ) : (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => reviewDiscount(p.id, true)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Autorizar</button>
                      <button type="button" onClick={() => reviewDiscount(p.id, false)} className="btn-secondary px-3 py-1.5 text-xs text-red-600"><X className="h-3.5 w-3.5" /> Rechazar</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form onSubmit={createPlan} className="card p-5 space-y-3">
        <h2 className="font-semibold">Nuevo presupuesto</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Título" />
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <select
              className="col-span-4 rounded border px-2 py-1.5 text-sm"
              value={line.procedureId}
              onChange={(e) => onProcChange(i, e.target.value)}
              required
            >
              <option value="">Procedimiento…</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
            <input type="number" min={1} className="col-span-1 rounded border px-2 py-1.5 text-sm" value={line.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
            <input type="number" className="col-span-2 rounded border px-2 py-1.5 text-sm" value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} placeholder="Precio" />
            <input type="number" className="col-span-2 rounded border px-2 py-1.5 text-sm" value={line.labCost} onChange={(e) => setLine(i, { labCost: Number(e.target.value) })} placeholder="Lab" title="Costo de laboratorio" />
            <input type="number" min={0} className="col-span-1 rounded border px-2 py-1.5 text-sm" value={line.discount} onChange={(e) => setLine(i, { discount: Number(e.target.value) })} placeholder="Desc." title="Descuento del ítem" />
            <input type="number" min={1} className="col-span-1 rounded border px-2 py-1.5 text-sm" value={line.phase} onChange={(e) => setLine(i, { phase: Number(e.target.value) })} title="Fase" />
            <button type="button" className="col-span-1 text-ink-400 text-sm" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="hidden grid-cols-12 gap-2 text-[11px] text-ink-400 sm:grid">
          <span className="col-span-4">Procedimiento</span><span>Cant.</span><span className="col-span-2">Precio</span><span className="col-span-2">Laboratorio</span><span>Desc.</span><span>Fase</span>
        </div>
        <button type="button" onClick={() => setLines((p) => [...p, { ...EMPTY_LINE }])} className="text-sm text-clinical-600">
          + Ítem / fase
        </button>
        <div className="grid gap-3 border-t border-ink-100 pt-3 sm:grid-cols-3">
          <div>
            <label className="label">Descuento global ($)</label>
            <input type="number" min={0} step="0.01" value={planDiscount} onChange={(e) => setPlanDiscount(Number(e.target.value))} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Motivo del descuento {totalDiscount > 0 && <span className="text-red-500">*</span>}</label>
            <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className="input" placeholder="Convenio, paciente frecuente, tratamiento extenso…" required={totalDiscount > 0} disabled={totalDiscount === 0} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
          <span>Bruto ${grossTotal.toFixed(2)} · Descuento ${totalDiscount.toFixed(2)}{grossTotal > 0 && totalDiscount > 0 ? ` (${((totalDiscount / grossTotal) * 100).toFixed(1)} %)` : ''}</span>
          <strong>Total ${Math.max(0, grossTotal - totalDiscount).toFixed(2)}</strong>
        </div>
        {totalDiscount > 0 && <p className="text-xs text-amber-700">El descuento deberá ser autorizado por otro profesional antes de enviar o aprobar el presupuesto (RF-07).</p>}
        <button type="submit" disabled={busy} className="btn-primary px-5">
          Crear plan
        </button>
      </form>

      <div className="space-y-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap justify-between gap-2 mb-2">
              <div>
                <div className="font-medium">{plan.title || 'Plan'}</div>
                <div className="text-xs text-ink-500">{plan.status} · Total {Number(plan.totalAmount).toFixed(2)}</div>
                {plan.discountStatus && plan.discountStatus !== 'NONE' && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn('chip', DISCOUNT_BADGE[plan.discountStatus].cls)}><BadgePercent className="h-3 w-3" /> {DISCOUNT_BADGE[plan.discountStatus].label}</span>
                    {plan.discountReason && <span className="text-ink-500">Motivo: {plan.discountReason}</span>}
                    {plan.discountReviewNote && <span className="text-ink-500">· Nota: {plan.discountReviewNote}</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {plan.status === 'BORRADOR' && (
                  <button type="button" disabled={plan.discountStatus === 'PENDING' || plan.discountStatus === 'REJECTED'} onClick={() => sendPlan(plan.id)} className="text-xs rounded border px-2 py-1 disabled:opacity-40">Enviar</button>
                )}
                <button
                  disabled={plan.discountStatus === 'PENDING' || plan.discountStatus === 'REJECTED'}
                  type="button"
                  onClick={() => {
                    setApprovePlanId(plan.id);
                    setSelectedItems(plan.items.filter((i) => !i.isApproved).map((i) => i.id));
                  }}
                  className="text-xs rounded bg-clinical-600 text-white px-2 py-1 disabled:opacity-40"
                >
                  Aprobar ítems
                </button>
              </div>
            </div>
            <ul className="text-xs space-y-1">
              {plan.items.map((it) => (
                <li key={it.id} className={it.isApproved ? 'text-emerald-700' : 'text-ink-600'}>
                  Fase {it.phase}: {it.procedure?.name || it.procedureId} ×{it.quantity} — {Number(it.unitPrice).toFixed(0)}
                  {it.isApproved ? ' ✓' : ''}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {approvePlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setApprovePlanId(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Aprobar ítems (RF-08)</h3>
            <p className="text-xs text-ink-500">Selecciona ítems y opcionalmente genera citas en cadena.</p>
            {plans
              .find((p) => p.id === approvePlanId)
              ?.items.filter((i) => !i.isApproved)
              .map((it) => (
                <label key={it.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(it.id)}
                    onChange={(e) =>
                      setSelectedItems((prev) =>
                        e.target.checked ? [...prev, it.id] : prev.filter((x) => x !== it.id),
                      )
                    }
                  />
                  {it.procedure?.name} (fase {it.phase})
                </label>
              ))}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-ink-600">Crear citas al aprobar (opcional)</p>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Doctor…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                ))}
              </select>
              <select value={chairId} onChange={(e) => setChairId(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="">Sillón…</option>
                {chairs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => approve(false)} disabled={busy} className="flex-1 rounded border py-2 text-sm">Solo aprobar</button>
              <button type="button" onClick={() => approve(true)} disabled={busy || !doctorId || !chairId || !startAt} className="flex-1 rounded bg-clinical-600 text-white py-2 text-sm disabled:opacity-50">
                Aprobar + citas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
