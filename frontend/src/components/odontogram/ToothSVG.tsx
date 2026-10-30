'use client';

import { cn } from '@/lib/utils';
import type { SurfaceStatus, ToothSurfaces } from '@/types';

const SURFACE_COLORS: Record<string, string> = {
  caries: '#ef4444',
  restoration: '#3b82f6',
  endodontics: '#8b5cf6',            // realizada
  endodontics_required: '#c4b5fd',   // requerida (por hacer)
  implant: '#22c55e',
  sealant: '#eab308',
  crown: '#f59e0b',
  pontic: '#94a3b8',
  missing: '#cbd5e1',
  prosthesis_fixed: '#f59e0b',
  prosthesis_removable: '#64748b',
};

interface ToothSVGProps {
  number: string;
  surfaces: ToothSurfaces;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
}

/**
 * Diente esquemático 2D con 5 superficies clicables:
 * V (vestibular/arriba), L (lingual/abajo), M (mesial/izq), D (distal/der), O (oclusal/centro)
 */
export function ToothSVG({ number, surfaces, selected, onClick, size = 48 }: ToothSVGProps) {
  const isMissing = surfaces.status === 'missing' || surfaces.status === 'extracted';
  const s = size;
  const pad = 2;

  function fill(key: string) {
    const val = surfaces[key] as SurfaceStatus;
    if (!val) return '#f8fafc';
    return SURFACE_COLORS[val] || '#f8fafc';
  }

  if (isMissing) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex flex-col items-center rounded-md p-0.5 transition',
          selected && 'ring-2 ring-clinical-500 ring-offset-1',
        )}
        title={`Diente ${number} (ausente)`}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect
            x={pad}
            y={pad}
            width={s - pad * 2}
            height={s - pad * 2}
            rx={4}
            fill="#e2e8f0"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <line x1={pad + 4} y1={pad + 4} x2={s - pad - 4} y2={s - pad - 4} stroke="#94a3b8" strokeWidth={1.5} />
        </svg>
        <span className="text-[10px] font-medium text-ink-400 mt-0.5">{number}</span>
      </button>
    );
  }

  // Geometry: outer box divided into 5 regions
  const mid = s / 2;
  const band = s * 0.28; // thickness of outer surfaces

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center rounded-md p-0.5 transition hover:bg-ink-100',
        selected && 'ring-2 ring-clinical-500 ring-offset-1 bg-clinical-50',
      )}
      title={`Diente ${number}`}
    >
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        {/* Vestibular (top) */}
        <path
          d={`M ${pad} ${pad} H ${s - pad} L ${s - pad - band} ${pad + band} H ${pad + band} Z`}
          fill={fill('V')}
          stroke="#64748b"
          strokeWidth={0.8}
        />
        {/* Lingual (bottom) */}
        <path
          d={`M ${pad} ${s - pad} H ${s - pad} L ${s - pad - band} ${s - pad - band} H ${pad + band} Z`}
          fill={fill('L')}
          stroke="#64748b"
          strokeWidth={0.8}
        />
        {/* Mesial (left) */}
        <path
          d={`M ${pad} ${pad} V ${s - pad} L ${pad + band} ${s - pad - band} V ${pad + band} Z`}
          fill={fill('M')}
          stroke="#64748b"
          strokeWidth={0.8}
        />
        {/* Distal (right) */}
        <path
          d={`M ${s - pad} ${pad} V ${s - pad} L ${s - pad - band} ${s - pad - band} V ${pad + band} Z`}
          fill={fill('D')}
          stroke="#64748b"
          strokeWidth={0.8}
        />
        {/* Oclusal / Incisal (center) */}
        <rect
          x={pad + band}
          y={pad + band}
          width={s - 2 * (pad + band)}
          height={s - 2 * (pad + band)}
          fill={fill('O') !== '#f8fafc' ? fill('O') : fill('I')}
          stroke="#64748b"
          strokeWidth={0.8}
          rx={2}
        />
        {/* RF-03: endodoncia (realizada = línea sólida, requerida = línea punteada) */}
        {(surfaces.status === 'endodontics' || surfaces.status === 'endodontics_required') && (
          <line
            x1={mid} y1={pad} x2={mid} y2={s - pad}
            stroke={SURFACE_COLORS.endodontics}
            strokeWidth={2.5}
            strokeDasharray={surfaces.status === 'endodontics_required' ? '3 2' : undefined}
          />
        )}
        {/* Exodoncia indicada: X roja */}
        {surfaces.status === 'extraction_required' && (
          <g stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round">
            <line x1={pad + 2} y1={pad + 2} x2={s - pad - 2} y2={s - pad - 2} />
            <line x1={s - pad - 2} y1={pad + 2} x2={pad + 2} y2={s - pad - 2} />
          </g>
        )}
        {/* Implant / crown indicator */}
        {surfaces.status === 'implant' && (
          <circle cx={mid} cy={mid} r={6} fill={SURFACE_COLORS.implant} opacity={0.85} />
        )}
        {surfaces.status === 'crown' && (
          <rect
            x={mid - 8}
            y={mid - 8}
            width={16}
            height={16}
            rx={2}
            fill="none"
            stroke={SURFACE_COLORS.crown}
            strokeWidth={2}
          />
        )}
      </svg>
      <span className="text-[10px] font-semibold text-ink-600 mt-0.5">{number}</span>
    </button>
  );
}
