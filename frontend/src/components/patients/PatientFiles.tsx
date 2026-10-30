'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, FileText, Upload, ExternalLink, Lock } from 'lucide-react';
import { api } from '@/lib/api';

const KINDS: { value: string; label: string }[] = [
  { value: 'RX_PANORAMICA', label: 'Rx panorámica' },
  { value: 'RX_PERIAPICAL', label: 'Rx periapical' },
  { value: 'RX_OTRA', label: 'Otra radiografía' },
  { value: 'FOTO_INTRAORAL', label: 'Foto intraoral' },
  { value: 'FOTO_EXTRAORAL', label: 'Foto extraoral' },
  { value: 'DOCUMENTO', label: 'Documento (PDF)' },
  { value: 'OTRO', label: 'Otro' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

function size(n: number) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB';
}

export function PatientFiles({ patientId }: { patientId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [kind, setKind] = useState('RX_PANORAMICA');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api('/files/patient/' + patientId)
      .then((d) => setFiles(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024) { setError('El archivo supera 25 MB'); return; }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      if (notes) fd.append('notes', notes);
      await api('/files/patient/' + patientId, { method: 'POST', body: fd });
      setNotes('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function open(id: string) {
    try {
      const { url } = await api(`/files/${id}/download`);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
        className={'card border-2 border-dashed p-5 transition ' + (drag ? 'border-clinical-400 bg-clinical-50' : 'border-ink-200')}
      >
        <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <div>
            <label className="label">Tipo</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="input">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nota (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Ej. control post-endodoncia 36" />
          </div>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-primary">
            <Upload className="h-4 w-4" /> {busy ? 'Subiendo…' : 'Subir archivo'}
          </button>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.dcm,application/dicom" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
          <Lock className="h-3 w-3" /> JPG, PNG, WEBP, PDF o DICOM hasta 25 MB. También puedes arrastrar el archivo aquí. Se guardan cifrados y cada apertura queda auditada.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {files.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">Sin archivos</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => {
            const Icon = f.mimeType.startsWith('image/') ? FileImage : FileText;
            return (
              <button key={f.id} type="button" onClick={() => open(f.id)} className="card group flex items-start gap-3 p-4 text-left hover:border-clinical-200 hover:shadow-lift">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-clinical-50 text-clinical-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">{f.fileName}</div>
                  <div className="text-xs text-ink-500">{KIND_LABEL[f.kind] || f.kind} · {size(f.sizeBytes)}</div>
                  <div className="text-xs text-ink-400">{new Date(f.createdAt).toLocaleDateString('es-EC')} · {f.uploadedBy?.firstName} {f.uploadedBy?.lastName}</div>
                  {f.notes && <div className="mt-1 truncate text-xs italic text-ink-500">{f.notes}</div>}
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-clinical-600" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
