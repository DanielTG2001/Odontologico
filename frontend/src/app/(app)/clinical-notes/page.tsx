'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FilePlus2, Lock, PenLine, Plus, ShieldCheck } from 'lucide-react';
import { PatientPicker } from '@/components/patients/PatientPicker';

interface Note {
  id: string;
  patientId: string;
  subjective?: string;
  objective?: string;
  evaluation?: string;
  plan?: string;
  isLocked: boolean;
  signedAt?: string;
  createdAt: string;
  author?: { firstName: string; lastName: string };
  patient?: { firstName: string; lastName: string };
  addenda?: Addendum[];
}

interface Addendum {
  id: string;
  reason: string;
  content: string;
  signedAt: string;
  signatureData: string;
  author?: { firstName: string; lastName: string };
}

const LOCK_HOURS = Number(process.env.NEXT_PUBLIC_NOTE_LOCK_HOURS || 24);
const isClosed = (n: Note) => n.isLocked || Date.now() - new Date(n.createdAt).getTime() > LOCK_HOURS * 3600 * 1000;

function AddendumForm({ noteId, onDone }: { noteId: string; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/clinical-notes/' + noteId + '/addenda', {
        method: 'POST',
        body: JSON.stringify({ reason, content }),
      });
      setReason('');
      setContent('');
      setOpen(false);
      onDone('Adenda firmada y agregada a la nota');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-clinical-700 hover:text-clinical-800">
        <FilePlus2 className="h-4 w-4" /> Agregar adenda
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-clinical-200 bg-clinical-50/50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-clinical-800">Nueva adenda (RN-01)</div>
      {error && <div className="alert-error">{error}</div>}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la corrección" className="input" required minLength={5} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Texto de la adenda" rows={3} className="input" required />
      <p className="text-xs text-ink-500">Al guardar, la adenda queda firmada con tu usuario y no podrá modificarse ni borrarse.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Firmando…' : 'Firmar adenda'}</button>
      </div>
    </form>
  );
}

export default function ClinicalNotesPage() {
  const [patientId, setPatientId] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    subjective: '',
    objective: '',
    evaluation: '',
    plan: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!patientId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await api('/clinical-notes/patient/' + patientId.trim());
      setNotes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  async function createNote(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId.trim()) {
      setError('Indica el ID del paciente');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/clinical-notes', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patientId.trim(),
          ...form,
        }),
      });
      setForm({ subjective: '', objective: '', evaluation: '', plan: '' });
      setShowForm(false);
      setMessage('Nota SOEP creada');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function signNote(id: string) {
    if (!confirm('¿Firmar y bloquear esta nota? No se podrá editar después.')) return;
    setError('');
    try {
      await api('/clinical-notes/' + id + '/sign', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMessage('Nota firmada y bloqueada');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Notas clínicas SOEP</h1>
        <p className="page-subtitle">
          Subjetivo · Objetivo · Evaluación · Plan · Bloqueo a las 24h o al firmar (RF-05)
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Paciente</label>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Cargando…' : 'Cargar notas'}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium hover:bg-ink-50"
        >
          <Plus className="h-4 w-4" /> Nueva nota
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {message && <div className="alert-success">{message}</div>}

      {showForm && (
        <form onSubmit={createNote} className="rounded-xl border border-clinical-200 bg-clinical-50 p-5 space-y-3">
          <h2 className="font-semibold text-ink-900">Nueva nota SOEP</h2>
          {(['subjective', 'objective', 'evaluation', 'plan'] as const).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-ink-600 mb-1 uppercase">
                {key === 'subjective' && 'S — Subjetivo'}
                {key === 'objective' && 'O — Objetivo'}
                {key === 'evaluation' && 'E — Evaluación'}
                {key === 'plan' && 'P — Plan'}
              </label>
              <textarea
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-ink-300 px-4 py-2 text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : 'Guardar nota'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {notes.length === 0 && !loading && (
          <p className="text-center text-ink-400 py-8">Sin notas o aún no has cargado un paciente</p>
        )}
        {notes.map((n) => (
          <div
            key={n.id}
            className={cn(
              'card p-5',
              !isClosed(n) && 'border-amber-200',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-xs text-ink-500">
                {n.author?.firstName} {n.author?.lastName}
                {' · '}
                {new Date(n.createdAt).toLocaleString('es')}
              </div>
              <div className="flex items-center gap-2">
                {isClosed(n) ? (
                  <span className="chip bg-ink-100 text-ink-600">
                    <Lock className="h-3 w-3" /> {n.signedAt ? 'Firmada' : 'Bloqueada por plazo'}
                  </span>
                ) : (
                  <button type="button" onClick={() => signNote(n.id)} className="btn-primary px-3 py-1.5 text-xs">
                    <PenLine className="h-3 w-3" /> Firmar y bloquear
                  </button>
                )}
              </div>
            </div>
            {n.subjective && <p className="text-sm mb-1"><span className="font-semibold text-ink-600">S:</span> {n.subjective}</p>}
            {n.objective && <p className="text-sm mb-1"><span className="font-semibold text-ink-600">O:</span> {n.objective}</p>}
            {n.evaluation && <p className="text-sm mb-1"><span className="font-semibold text-ink-600">E:</span> {n.evaluation}</p>}
            {n.plan && <p className="text-sm"><span className="font-semibold text-ink-600">P:</span> {n.plan}</p>}

            {(n.addenda?.length ?? 0) > 0 && (
              <div className="mt-4 space-y-2 border-l-2 border-clinical-300 pl-4">
                {n.addenda!.map((a) => (
                  <div key={a.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <span className="chip bg-clinical-100 text-clinical-800">Adenda</span>
                      {a.author?.firstName} {a.author?.lastName} · {new Date(a.signedAt).toLocaleString('es-EC')}
                      <span className="inline-flex items-center gap-1 text-emerald-700" title={a.signatureData}>
                        <ShieldCheck className="h-3 w-3" /> firmada
                      </span>
                    </div>
                    <div className="mt-1 text-xs italic text-ink-500">Motivo: {a.reason}</div>
                    <p className="mt-0.5 whitespace-pre-wrap">{a.content}</p>
                  </div>
                ))}
              </div>
            )}

            {isClosed(n) && <AddendumForm noteId={n.id} onDone={(m) => { setMessage(m); load(); }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
