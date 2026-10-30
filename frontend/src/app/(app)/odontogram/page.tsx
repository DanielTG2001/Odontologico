'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OdontogramChart } from '@/components/odontogram/OdontogramChart';
import type { DentitionType, NotationSystem, ToothSurfaces } from '@/types';
import { api } from '@/lib/api';
import { PatientPicker } from '@/components/patients/PatientPicker';

function OdontogramInner() {
  const searchParams = useSearchParams();
  const [patientId, setPatientId] = useState(searchParams.get('patientId') || '');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [teeth, setTeeth] = useState<Record<string, ToothSurfaces>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dentition, setDentition] = useState<DentitionType>('permanent');
  const [notation, setNotation] = useState<NotationSystem>('FDI');

  async function loadOdontogram(nextNotation?: NotationSystem) {
    if (!patientId.trim()) return;
    const n = nextNotation || notation;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await api(`/odontogram/patient/${patientId.trim()}?notation=${n}`);
      const map: Record<string, ToothSurfaces> = {};
      for (const t of data.teeth || []) {
        map[t.toothNumber] = t.surfaces || {};
      }
      setTeeth(map);
      setLoadedId(patientId.trim());
      setMessage(
        `Odontograma cargado · ${n} · ${(data.teeth || []).length} dientes con registro`,
      );
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar el odontograma');
      setTeeth({});
      setLoadedId(null);
    } finally {
      setLoading(false);
    }
  }

  const handleNotationChange = useCallback(
    (n: NotationSystem) => {
      setNotation(n);
      setTeeth({});
      if (loadedId) {
        setTimeout(() => loadOdontogram(n), 0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedId, patientId],
  );

  const handleChange = useCallback(
    async (toothNumber: string, surfaces: ToothSurfaces) => {
      setTeeth((prev) => ({ ...prev, [toothNumber]: surfaces }));
      if (!loadedId) return;

      setSaving(true);
      try {
        await api('/odontogram/tooth', {
          method: 'PUT',
          body: JSON.stringify({
            patientId: loadedId,
            toothNumber,
            notation,
            surfaces,
          }),
        });
        setMessage(`Diente ${toothNumber} (${notation}) guardado`);
      } catch (err: any) {
        setError(err.message || 'Error al guardar');
      } finally {
        setSaving(false);
      }
    },
    [loadedId, notation],
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Odontograma</h1>
        <p className="page-subtitle">
          Dentición permanente (32) y temporal (20) · Notación FDI y Universal · Superficies M, O, D, V, L, I · Tablet-ready
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Paciente</label>
          <PatientPicker value={patientId} onChange={setPatientId} />
        </div>
        <button
          type="button"
          onClick={() => loadOdontogram()}
          disabled={loading || !patientId.trim()}
          className="btn-primary px-5"
        >
          {loading ? 'Cargando…' : 'Cargar odontograma'}
        </button>
      </div>

      {(message || error || saving) && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            error
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {error || (saving ? 'Guardando…' : message)}
        </div>
      )}

      <OdontogramChart
        teeth={teeth}
        onChange={loadedId ? handleChange : undefined}
        readOnly={!loadedId}
        dentition={dentition}
        notation={notation}
        onDentitionChange={setDentition}
        onNotationChange={handleNotationChange}
      />

      {!loadedId && (
        <p className="text-sm text-ink-500 text-center">
          Ingresa el ID de un paciente y carga su odontograma para editar.
          Sin paciente puedes explorar la estructura visual (permanente/temporal y FDI/Universal).
        </p>
      )}
    </div>
  );
}

export default function OdontogramPage() {
  return (
    <Suspense fallback={<div className="text-ink-400 p-8">Cargando…</div>}>
      <OdontogramInner />
    </Suspense>
  );
}
