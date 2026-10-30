'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Pill, Plus, Printer, Trash2, Ban } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PatientPicker } from '@/components/patients/PatientPicker';

interface Item {
  medication: string;
  presentation: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: string;
  instructions: string;
}

const EMPTY: Item = { medication: '', presentation: '', dose: '', frequency: '', duration: '', route: 'Oral', quantity: '', instructions: '' };

/** Plantillas frecuentes en odontología (editables antes de firmar). */
const TEMPLATES: { label: string; item: Item }[] = [
  { label: 'Ibuprofeno 400', item: { ...EMPTY, medication: 'Ibuprofeno', presentation: 'Tabletas 400 mg', dose: '1 tableta', frequency: 'cada 8 horas', duration: '3 días', quantity: '9 tabletas', instructions: 'Tomar con alimentos' } },
  { label: 'Paracetamol 500', item: { ...EMPTY, medication: 'Paracetamol', presentation: 'Tabletas 500 mg', dose: '1 tableta', frequency: 'cada 6 horas', duration: '3 días', quantity: '12 tabletas', instructions: 'No exceder 4 g al día' } },
  { label: 'Amoxicilina 500', item: { ...EMPTY, medication: 'Amoxicilina', presentation: 'Cápsulas 500 mg', dose: '1 cápsula', frequency: 'cada 8 horas', duration: '7 días', quantity: '21 cápsulas', instructions: 'Completar el tratamiento' } },
  { label: 'Clindamicina 300', item: { ...EMPTY, medication: 'Clindamicina', presentation: 'Cápsulas 300 mg', dose: '1 cápsula', frequency: 'cada 8 horas', duration: '7 días', quantity: '21 cápsulas', instructions: 'Alternativa en alérgicos a penicilina' } },
  { label: 'Clorhexidina 0,12 %', item: { ...EMPTY, medication: 'Clorhexidina', presentation: 'Colutorio 0,12 %', dose: '15 ml', frequency: 'cada 12 horas', duration: '7 días', route: 'Enjuague bucal', quantity: '1 frasco', instructions: 'No ingerir. No comer 30 min después' } },
];

function PrescriptionsInner() {
  const params = useSearchParams();
  const [patientId, setPatientId] = useState(params.get('patientId') || '');
  const [list, setList] = useState<any[]>([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [indications, setIndications] = useState('');
  const [items, setItems] = useState<Item[]>([{ ...EMPTY }]);
  const [override, setOverride] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) { setList([]); return; }
    try {
      const data = await api('/prescriptions/patient/' + patientId);
      setList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
    setConflict(null);
  }

  function addTemplate(t: Item) {
    setItems((arr) => (arr.length === 1 && !arr[0].medication ? [{ ...t }] : [...arr, { ...t }]));
    setConflict(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setWarnings([]);
    setBusy(true);
    try {
      const clean = items
        .filter((i) => i.medication.trim())
        .map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== '')));
      const rx = await api('/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          diagnosis: diagnosis || undefined,
          indications: indications || undefined,
          items: clean,
          ...(conflict && override ? { allergyOverride: override } : {}),
        }),
      });
      setMessage(`Receta ${rx.number} firmada`);
      setWarnings(rx.warnings || []);
      setItems([{ ...EMPTY }]);
      setDiagnosis('');
      setIndications('');
      setOverride('');
      setConflict(null);
      load();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.body?.code === 'ALLERGY_CONFLICT') {
        setConflict(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function annul(id: string) {
    const reason = window.prompt('Motivo de anulación (obligatorio):');
    if (!reason || reason.trim().length < 5) return;
    try {
      await api(`/prescriptions/${id}/annul`, { method: 'POST', body: JSON.stringify({ reason }) });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Recetas</h1>
        <p className="page-subtitle">Prescripción firmada con verificación de alergias. Las recetas no se borran: solo se anulan.</p>
      </div>

      <div className="max-w-xl">
        <label className="label">Paciente</label>
        <PatientPicker value={patientId} onChange={setPatientId} />
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}
      {warnings.map((w) => (
        <div key={w} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> {w}
        </div>
      ))}

      {patientId && (
        <form onSubmit={submit} className="card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Pill className="h-4 w-4 text-clinical-600" /> Nueva receta</h2>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button key={t.label} type="button" onClick={() => addTemplate(t.item)} className="chip border border-ink-200 bg-white text-ink-700 hover:border-clinical-300 hover:bg-clinical-50">
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Diagnóstico</label>
              <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="input" placeholder="Ej. Pulpitis irreversible pieza 36" />
            </div>
            <div>
              <label className="label">Indicaciones generales</label>
              <input value={indications} onChange={(e) => setIndications(e.target.value)} className="input" placeholder="Dieta blanda, hielo local 24 h…" />
            </div>
          </div>

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-ink-100 bg-ink-50/40 p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <input value={it.medication} onChange={(e) => setItem(i, { medication: e.target.value })} className="input sm:col-span-4" placeholder="Medicamento *" required={i === 0} />
                  <input value={it.presentation} onChange={(e) => setItem(i, { presentation: e.target.value })} className="input sm:col-span-4" placeholder="Presentación" />
                  <input value={it.route} onChange={(e) => setItem(i, { route: e.target.value })} className="input sm:col-span-2" placeholder="Vía" />
                  <input value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} className="input sm:col-span-2" placeholder="Cantidad" />
                  <input value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value })} className="input sm:col-span-3" placeholder="Dosis *" required={!!it.medication} />
                  <input value={it.frequency} onChange={(e) => setItem(i, { frequency: e.target.value })} className="input sm:col-span-3" placeholder="Frecuencia *" required={!!it.medication} />
                  <input value={it.duration} onChange={(e) => setItem(i, { duration: e.target.value })} className="input sm:col-span-2" placeholder="Duración *" required={!!it.medication} />
                  <input value={it.instructions} onChange={(e) => setItem(i, { instructions: e.target.value })} className="input sm:col-span-3" placeholder="Instrucciones" />
                  <button type="button" onClick={() => setItems((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : [{ ...EMPTY }]))} className="btn-secondary px-2 sm:col-span-1" aria-label="Quitar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setItems((a) => [...a, { ...EMPTY }])} className="inline-flex items-center gap-1 text-sm font-medium text-clinical-700">
              <Plus className="h-4 w-4" /> Agregar medicamento
            </button>
          </div>

          {conflict && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2 text-sm font-semibold text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {conflict}
              </div>
              <textarea value={override} onChange={(e) => setOverride(e.target.value)} rows={2} className="input" placeholder="Justificación clínica para prescribir de todos modos (mín. 10 caracteres)" />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <p className="text-xs text-ink-400">Al guardar, la receta queda firmada electrónicamente con tu usuario.</p>
            <button type="submit" disabled={busy || (!!conflict && override.trim().length < 10)} className="btn-primary">
              {busy ? 'Firmando…' : conflict ? 'Firmar con justificación' : 'Firmar receta'}
            </button>
          </div>
        </form>
      )}

      {list.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-4 py-3 text-left">N.º</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Medicamentos</th>
                <th className="px-4 py-3 text-left">Profesional</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {list.map((rx) => (
                <tr key={rx.id} className={cn('border-t border-ink-100', rx.status === 'ANNULLED' && 'opacity-50')}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {rx.number}
                    {rx.status === 'ANNULLED' && <span className="chip ml-2 bg-red-100 text-red-700">Anulada</span>}
                  </td>
                  <td className="px-4 py-3">{new Date(rx.createdAt).toLocaleDateString('es-EC')}</td>
                  <td className="px-4 py-3">{rx.items.map((i: any) => i.medication).join(', ')}</td>
                  <td className="px-4 py-3">Dr/a. {rx.doctor?.lastName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link href={`/prescriptions/${rx.id}`} className="btn-secondary px-2.5 py-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Ver / imprimir</Link>
                    {rx.status === 'ACTIVE' && (
                      <button type="button" onClick={() => annul(rx.id)} className="ml-1 btn-secondary px-2.5 py-1.5 text-xs text-red-600"><Ban className="h-3.5 w-3.5" /> Anular</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PrescriptionsPage() {
  return (
    <Suspense>
      <PrescriptionsInner />
    </Suspense>
  );
}
