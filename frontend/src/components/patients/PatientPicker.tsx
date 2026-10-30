'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PatientLite {
  id: string;
  firstName: string;
  lastName: string;
  documentType?: string;
  documentNumber?: string;
  medicalHistory?: { hasCriticalAlert?: boolean; criticalAlertReason?: string };
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Se llama al elegir un paciente de la lista (útil para cargar datos de inmediato). */
  onPick?: (p: PatientLite) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Buscador de pacientes por nombre, documento o teléfono.
 * Reemplaza el ingreso manual del ID interno. También acepta pegar un ID.
 */
export function PatientPicker({ value, onChange, onPick, className, placeholder = 'Buscar por nombre, cédula o teléfono…' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientLite[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PatientLite | null>(null);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Si llega un ID por URL/estado, resolver el nombre
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    api('/patients/' + value)
      .then((p) => setSelected(p))
      .catch(() => setSelected(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api('/patients?limit=8&search=' + encodeURIComponent(term));
        setResults(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pick(p: PatientLite) {
    setSelected(p);
    setQuery('');
    setOpen(false);
    onChange(p.id);
    onPick?.(p);
  }

  if (selected && selected.id === value) {
    const alert = selected.medicalHistory?.hasCriticalAlert;
    return (
      <div className={cn('flex items-center gap-3 rounded-lg border bg-white px-3 py-2', alert ? 'border-red-200' : 'border-ink-200', className)}>
        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold', alert ? 'bg-red-100 text-red-700' : 'bg-clinical-100 text-clinical-800')}>
          {selected.firstName?.[0]}{selected.lastName?.[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-900">{selected.firstName} {selected.lastName}</div>
          <div className="truncate text-xs text-ink-400">
            {selected.documentType} {selected.documentNumber}
            {alert && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-red-600">
                <AlertTriangle className="h-3 w-3" /> {selected.medicalHistory?.criticalAlertReason || 'Alerta médica'}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setSelected(null); onChange(''); }}
          className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          aria-label="Cambiar paciente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          // Permite pegar un ID interno directamente y presionar Enter
          if (e.key === 'Enter' && /^c[a-z0-9]{20,}$/i.test(query.trim())) {
            e.preventDefault();
            onChange(query.trim());
          }
        }}
        placeholder={placeholder}
        className="input pl-9"
      />
      {loading && <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-clinical-500 border-t-transparent" />}
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-100 bg-white py-1 shadow-lift">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-ink-400">Sin resultados</div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-clinical-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{p.firstName} {p.lastName}</div>
                  <div className="text-xs text-ink-400">{p.documentType} {p.documentNumber}</div>
                </div>
                {p.medicalHistory?.hasCriticalAlert && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
