export type Role =
  | 'ADMIN_TI'
  | 'RECEPCIONISTA'
  | 'CAJERO'
  | 'ODONTOLOGO'
  | 'ESPECIALISTA'
  | 'ASISTENTE_DENTAL'
  | 'AUDITOR'
  | 'CONTADOR';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  mfaEnabled?: boolean;
}

export interface MedicalHistory {
  id?: string;
  systemicDiseases?: string;
  allergies?: string;
  surgicalHistory?: string;
  coagulopathies?: string;
  medications?: string;
  hasCriticalAlert: boolean;
  criticalAlertReason?: string;
  notes?: string;
}

export interface Patient {
  id: string;
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  isMinor?: boolean;
  tutorName?: string;
  tutorDocument?: string;
  insuranceName?: string;
  insuranceNumber?: string;
  notes?: string;
  medicalHistory?: MedicalHistory;
}

export type AppointmentStatus =
  | 'PROGRAMADO'
  | 'CONFIRMADO'
  | 'EN_SALA_ESPERA'
  | 'EN_ATENCION'
  | 'ATENDIDO'
  | 'CANCELADO'
  | 'NO_ASISTIO';

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  chairId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    documentNumber?: string;
    phone?: string;
    medicalHistory?: { hasCriticalAlert: boolean; criticalAlertReason?: string };
  };
  doctor?: { id: string; firstName: string; lastName: string };
  chair?: { id: string; name: string; location?: string };
  items?: any[];
}

export interface Chair {
  id: string;
  name: string;
  location?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface Invoice {
  id: string;
  number: string;
  patientId: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  issuedAt?: string;
  patient?: { firstName: string; lastName: string; documentNumber?: string };
  items?: InvoiceItem[];
  payments?: { method: string; amount: number; reference?: string }[];
}

export type SurfaceCode = 'M' | 'O' | 'D' | 'V' | 'L' | 'I';
export type SurfaceStatus =
  | 'caries'
  | 'restoration'
  | 'endodontics'
  | 'endodontics_required'
  | 'extraction_required'
  | 'implant'
  | 'sealant'
  | 'crown'
  | 'pontic'
  | 'missing'
  | 'prosthesis_fixed'
  | 'prosthesis_removable'
  | null;

export type DentitionType = 'permanent' | 'deciduous';
export type NotationSystem = 'FDI' | 'UNIVERSAL';

export interface ToothSurfaces {
  status?: string;
  M?: SurfaceStatus;
  O?: SurfaceStatus;
  D?: SurfaceStatus;
  V?: SurfaceStatus;
  L?: SurfaceStatus;
  I?: SurfaceStatus;
  [key: string]: any;
}

export interface OdontogramTooth {
  toothNumber: string;
  notation: string;
  surfaces: ToothSurfaces;
  notes?: string;
}

// ---------- FDI permanente (32 dientes) ----------
export const FDI_UPPER = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
export const FDI_LOWER = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
export const FDI_ALL = [...FDI_UPPER, ...FDI_LOWER];

// ---------- FDI temporal / decidua (20 dientes) ----------
export const FDI_DECIDUOUS_UPPER = ['55','54','53','52','51','61','62','63','64','65'];
export const FDI_DECIDUOUS_LOWER = ['85','84','83','82','81','71','72','73','74','75'];
export const FDI_DECIDUOUS_ALL = [...FDI_DECIDUOUS_UPPER, ...FDI_DECIDUOUS_LOWER];

// ---------- Universal (ADA) permanente: 1-32 ----------
export const UNIVERSAL_UPPER = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16'];
export const UNIVERSAL_LOWER = ['32','31','30','29','28','27','26','25','24','23','22','21','20','19','18','17'];
export const UNIVERSAL_ALL = [...UNIVERSAL_UPPER, ...UNIVERSAL_LOWER];

// ---------- Universal temporal: A-T ----------
export const UNIVERSAL_DECIDUOUS_UPPER = ['A','B','C','D','E','F','G','H','I','J'];
export const UNIVERSAL_DECIDUOUS_LOWER = ['T','S','R','Q','P','O','N','M','L','K'];
export const UNIVERSAL_DECIDUOUS_ALL = [...UNIVERSAL_DECIDUOUS_UPPER, ...UNIVERSAL_DECIDUOUS_LOWER];

/** Mapa FDI permanente → Universal */
export const FDI_TO_UNIVERSAL: Record<string, string> = {
  '18': '1', '17': '2', '16': '3', '15': '4', '14': '5', '13': '6', '12': '7', '11': '8',
  '21': '9', '22': '10', '23': '11', '24': '12', '25': '13', '26': '14', '27': '15', '28': '16',
  '38': '17', '37': '18', '36': '19', '35': '20', '34': '21', '33': '22', '32': '23', '31': '24',
  '41': '25', '42': '26', '43': '27', '44': '28', '45': '29', '46': '30', '47': '31', '48': '32',
};

/** Mapa FDI temporal → Universal (A-T) */
export const FDI_DECIDUOUS_TO_UNIVERSAL: Record<string, string> = {
  '55': 'A', '54': 'B', '53': 'C', '52': 'D', '51': 'E',
  '61': 'F', '62': 'G', '63': 'H', '64': 'I', '65': 'J',
  '85': 'T', '84': 'S', '83': 'R', '82': 'Q', '81': 'P',
  '71': 'O', '72': 'N', '73': 'M', '74': 'L', '75': 'K',
};

export function getArchNumbers(
  dentition: DentitionType,
  notation: NotationSystem,
): { upper: string[]; lower: string[] } {
  if (dentition === 'permanent') {
    return notation === 'FDI'
      ? { upper: FDI_UPPER, lower: FDI_LOWER }
      : { upper: UNIVERSAL_UPPER, lower: UNIVERSAL_LOWER };
  }
  return notation === 'FDI'
    ? { upper: FDI_DECIDUOUS_UPPER, lower: FDI_DECIDUOUS_LOWER }
    : { upper: UNIVERSAL_DECIDUOUS_UPPER, lower: UNIVERSAL_DECIDUOUS_LOWER };
}

/** Convierte número de diente entre sistemas (mismo dentition) */
export function convertToothNumber(
  num: string,
  from: NotationSystem,
  to: NotationSystem,
  dentition: DentitionType,
): string {
  if (from === to) return num;
  const map =
    dentition === 'permanent' ? FDI_TO_UNIVERSAL : FDI_DECIDUOUS_TO_UNIVERSAL;
  if (from === 'FDI' && to === 'UNIVERSAL') return map[num] || num;
  const reverse = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  return reverse[num] || num;
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PROGRAMADO: 'Programado',
  CONFIRMADO: 'Confirmado',
  EN_SALA_ESPERA: 'En sala',
  EN_ATENCION: 'En atención',
  ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelado',
  NO_ASISTIO: 'No asistió',
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  PROGRAMADO: 'bg-ink-100 text-ink-700',
  CONFIRMADO: 'bg-sky-100 text-sky-800',
  EN_SALA_ESPERA: 'bg-amber-100 text-amber-800',
  EN_ATENCION: 'bg-violet-100 text-violet-800',
  ATENDIDO: 'bg-emerald-100 text-emerald-800',
  CANCELADO: 'bg-red-100 text-red-700',
  NO_ASISTIO: 'bg-orange-100 text-orange-800',
};
