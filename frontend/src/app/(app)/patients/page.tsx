'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Patient } from '@/types';
import { Search, AlertTriangle, Plus } from 'lucide-react';

export default function PatientsPage() {
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(q?: string) {
    setLoading(true);
    setError('');
    try {
      const qs = q ? '?search=' + encodeURIComponent(q) : '';
      const data = await api('/patients' + qs);
      setPatients(data.data || data || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar pacientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Pacientes</h1>
          <p className="page-subtitle">Ficha única, anamnesis y alertas críticas</p>
        </div>
        <Link
          href="/patients/new"
          className="btn-primary"
        >
          <Plus className="h-4 w-4" /> Nuevo paciente
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(search)}
            placeholder="Buscar por nombre, documento o teléfono…"
            className="w-full rounded-lg border border-ink-300 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
          />
        </div>
        <button type="button" onClick={() => load(search)} className="btn-primary">
          Buscar
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 border-b border-ink-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-ink-600">Paciente</th>
              <th className="text-left px-4 py-3 font-medium text-ink-600">Documento</th>
              <th className="text-left px-4 py-3 font-medium text-ink-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-ink-600">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400">Cargando…</td></tr>
            )}
            {!loading && patients.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-400">No hay pacientes</td></tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50">
                <td className="px-4 py-3">
                  <Link href={'/patients/' + p.id} className="font-medium text-clinical-700 hover:underline">
                    {p.lastName}, {p.firstName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-600">{p.documentType} {p.documentNumber}</td>
                <td className="px-4 py-3 text-ink-600">{p.phone || '—'}</td>
                <td className="px-4 py-3">
                  {p.medicalHistory?.hasCriticalAlert ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2.5 py-0.5 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      {p.medicalHistory.criticalAlertReason || 'Alerta crítica'}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
