'use client';

import { useState } from 'react';
import { ToothSVG } from './ToothSVG';
import {
  getArchNumbers,
  type DentitionType,
  type NotationSystem,
  type ToothSurfaces,
  type SurfaceStatus,
} from '@/types';
import { cn } from '@/lib/utils';

const LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'caries', label: 'Caries', color: 'bg-caries' },
  { key: 'restoration', label: 'Restauración', color: 'bg-restoration' },
  { key: 'endodontics', label: 'Endodoncia realizada', color: 'bg-endodontics' },
  { key: 'endodontics_required', label: 'Endodoncia requerida', color: 'bg-violet-300' },
  { key: 'extraction_required', label: 'Exodoncia indicada', color: 'bg-red-300' },
  { key: 'implant', label: 'Implante', color: 'bg-implant' },
  { key: 'sealant', label: 'Sellante', color: 'bg-sealant' },
  { key: 'crown', label: 'Corona / Prótesis fija', color: 'bg-amber-400' },
  { key: 'missing', label: 'Ausente / Exodoncia', color: 'bg-missing' },
  { key: 'prosthesis_removable', label: 'Prótesis removible', color: 'bg-ink-400' },
];

const SURFACE_OPTIONS: { value: SurfaceStatus; label: string }[] = [
  { value: null, label: 'Sano' },
  { value: 'caries', label: 'Caries' },
  { value: 'restoration', label: 'Restauración' },
  { value: 'endodontics', label: 'Endodoncia realizada' },
  { value: 'endodontics_required', label: 'Endodoncia requerida' },
  { value: 'sealant', label: 'Sellante' },
  { value: 'crown', label: 'Corona' },
  { value: 'prosthesis_fixed', label: 'Prótesis fija' },
  { value: 'prosthesis_removable', label: 'Prótesis removible' },
];

const STATUS_OPTIONS = [
  { value: 'present', label: 'Presente' },
  { value: 'missing', label: 'Ausente / Extraído' },
  { value: 'extraction_required', label: 'Exodoncia indicada' },
  { value: 'endodontics', label: 'Endodoncia realizada' },
  { value: 'endodontics_required', label: 'Endodoncia requerida' },
  { value: 'implant', label: 'Implante' },
  { value: 'pontic', label: 'Póntico' },
  { value: 'crown', label: 'Corona' },
];

interface Props {
  teeth: Record<string, ToothSurfaces>;
  onChange?: (toothNumber: string, surfaces: ToothSurfaces) => void;
  readOnly?: boolean;
  dentition?: DentitionType;
  notation?: NotationSystem;
  onDentitionChange?: (d: DentitionType) => void;
  onNotationChange?: (n: NotationSystem) => void;
}

export function OdontogramChart({
  teeth,
  onChange,
  readOnly,
  dentition = 'permanent',
  notation = 'FDI',
  onDentitionChange,
  onNotationChange,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState<'M' | 'O' | 'D' | 'V' | 'L' | 'I'>('O');

  const current = selected ? teeth[selected] || {} : null;
  const { upper, lower } = getArchNumbers(dentition, notation);
  const archLabel = dentition === 'permanent' ? 'Permanente' : 'Temporal / Decidua';
  const notationLabel = notation === 'FDI' ? 'FDI' : 'Universal (ADA)';

  function selectTooth(num: string) {
    setSelected(num);
  }

  function updateSurface(surface: string, value: SurfaceStatus) {
    if (!selected || readOnly || !onChange) return;
    const next = { ...(teeth[selected] || {}), [surface]: value };
    onChange(selected, next);
  }

  function updateStatus(status: string) {
    if (!selected || readOnly || !onChange) return;
    const next = { ...(teeth[selected] || {}), status };
    onChange(selected, next);
  }

  function renderArch(numbers: string[], label: string) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-ink-500 uppercase tracking-wide">{label}</div>
        <div className="flex flex-wrap justify-center gap-1">
          {numbers.map((n) => (
            <ToothSVG
              key={n}
              number={n}
              surfaces={teeth[n] || {}}
              selected={selected === n}
              onClick={() => selectTooth(n)}
              size={dentition === 'deciduous' ? 48 : 52}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles dentición + nomenclatura */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-ink-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              onDentitionChange?.('permanent');
              setSelected(null);
            }}
            className={cn(
              'px-3 py-1.5 font-medium transition',
              dentition === 'permanent'
                ? 'bg-clinical-600 text-white'
                : 'bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            Permanente (32)
          </button>
          <button
            type="button"
            onClick={() => {
              onDentitionChange?.('deciduous');
              setSelected(null);
            }}
            className={cn(
              'px-3 py-1.5 font-medium transition border-l border-ink-200',
              dentition === 'deciduous'
                ? 'bg-clinical-600 text-white'
                : 'bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            Temporal (20)
          </button>
        </div>

        <div className="flex rounded-lg border border-ink-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => {
              onNotationChange?.('FDI');
              setSelected(null);
            }}
            className={cn(
              'px-3 py-1.5 font-medium transition',
              notation === 'FDI'
                ? 'bg-ink-800 text-white'
                : 'bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            FDI
          </button>
          <button
            type="button"
            onClick={() => {
              onNotationChange?.('UNIVERSAL');
              setSelected(null);
            }}
            className={cn(
              'px-3 py-1.5 font-medium transition border-l border-ink-200',
              notation === 'UNIVERSAL'
                ? 'bg-ink-800 text-white'
                : 'bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            Universal
          </button>
        </div>

        <span className="text-xs text-ink-500">
          {archLabel} · {notationLabel}
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {LEGEND.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5 text-xs text-ink-600">
            <span className={cn('h-3 w-3 rounded-sm', l.color)} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-ink-200 bg-white p-4 md:p-6 shadow-sm space-y-6">
        {renderArch(upper, `Superior (${notationLabel})`)}
        <div className="border-t border-dashed border-ink-200" />
        {renderArch(lower, `Inferior (${notationLabel})`)}
      </div>

      {/* Editor panel */}
      {selected && current && !readOnly && (
        <div className="rounded-xl border border-clinical-200 bg-clinical-50 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink-900">
              Diente <span className="text-clinical-700">{selected}</span>
              <span className="ml-2 text-xs font-normal text-ink-500">
                ({notationLabel} · {archLabel})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-ink-500 hover:text-ink-700"
            >
              Cerrar
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Estado del diente</label>
              <select
                className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
                value={(current.status as string) || 'present'}
                onChange={(e) => updateStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Superficie a editar</label>
              <div className="flex flex-wrap gap-1">
                {(['V', 'M', 'O', 'D', 'L', 'I'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setActiveSurface(s)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium border transition',
                      activeSurface === s
                        ? 'bg-clinical-600 text-white border-clinical-600'
                        : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-50',
                    )}
                    title={
                      s === 'V'
                        ? 'Vestibular'
                        : s === 'L'
                          ? 'Lingual / Palatino'
                          : s === 'M'
                            ? 'Mesial'
                            : s === 'D'
                              ? 'Distal'
                              : s === 'O'
                                ? 'Oclusal'
                                : 'Incisal'
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-ink-600 mb-1.5">
              Condición en superficie {activeSurface}
            </label>
            <div className="flex flex-wrap gap-2">
              {SURFACE_OPTIONS.map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => updateSurface(activeSurface, o.value)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm border transition',
                    current[activeSurface] === o.value
                      ? 'border-clinical-600 bg-clinical-100 text-clinical-800 font-medium'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
