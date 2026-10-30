import {
  LayoutDashboard, Users, Calendar, Smile, FileText, FileSignature, Receipt,
  Package, BarChart3, Wallet, Activity, Coins, ClipboardList, Pill, HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles que ven la opción (deben coincidir con @Roles del backend). Vacío = todos. */
  roles?: Role[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const CLINICOS: Role[] = ['ADMIN_TI', 'ODONTOLOGO', 'ESPECIALISTA', 'ASISTENTE_DENTAL', 'AUDITOR'];

export const NAV: NavGroup[] = [
  {
    title: 'General',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
      { href: '/patients', label: 'Pacientes', icon: Users, roles: ['ADMIN_TI', 'RECEPCIONISTA', 'CAJERO', 'ODONTOLOGO', 'ESPECIALISTA'] },
      { href: '/appointments', label: 'Agenda', icon: Calendar, roles: ['ADMIN_TI', 'RECEPCIONISTA', 'CAJERO', 'ODONTOLOGO'] },
    ],
  },
  {
    title: 'Clínico',
    items: [
      { href: '/odontogram', label: 'Odontograma', icon: Smile, roles: CLINICOS },
      { href: '/periodontogram', label: 'Periodontograma', icon: Activity, roles: CLINICOS },
      { href: '/vital-signs', label: 'Signos vitales', icon: HeartPulse, roles: ['ASISTENTE_DENTAL', 'ODONTOLOGO', 'ESPECIALISTA', 'ADMIN_TI', 'AUDITOR'] },
      { href: '/clinical-notes', label: 'Notas SOEP', icon: FileText, roles: CLINICOS },
      { href: '/prescriptions', label: 'Recetas', icon: Pill, roles: CLINICOS },
      { href: '/consents', label: 'Consentimientos', icon: FileSignature, roles: [...CLINICOS, 'RECEPCIONISTA'] },
      { href: '/treatments', label: 'Presupuestos', icon: ClipboardList, roles: ['ADMIN_TI', 'AUDITOR', 'CAJERO', 'ESPECIALISTA', 'ODONTOLOGO', 'RECEPCIONISTA'] },
    ],
  },
  {
    title: 'Administración',
    items: [
      { href: '/billing', label: 'Facturación', icon: Receipt, roles: ['ADMIN_TI', 'AUDITOR', 'CAJERO', 'CONTADOR', 'RECEPCIONISTA'] },
      { href: '/cash-closing', label: 'Cierre de caja', icon: Wallet, roles: ['ADMIN_TI', 'AUDITOR', 'CAJERO', 'CONTADOR', 'RECEPCIONISTA'] },
      { href: '/inventory', label: 'Inventario', icon: Package, roles: ['ADMIN_TI', 'ASISTENTE_DENTAL', 'AUDITOR', 'ODONTOLOGO', 'RECEPCIONISTA'] },
      { href: '/settlements', label: 'Honorarios', icon: Coins, roles: ['ADMIN_TI', 'CONTADOR', 'ODONTOLOGO'] },
      { href: '/reports', label: 'Reportes', icon: BarChart3, roles: ['ADMIN_TI', 'AUDITOR', 'CONTADOR', 'ODONTOLOGO'] },
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_TI: 'Administrador TI',
  RECEPCIONISTA: 'Recepción',
  CAJERO: 'Caja',
  ODONTOLOGO: 'Odontólogo/a',
  ESPECIALISTA: 'Especialista',
  ASISTENTE_DENTAL: 'Asistente dental',
  AUDITOR: 'Auditoría',
  CONTADOR: 'Contabilidad',
};

export function navForRole(role?: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || !role || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

export function findNavItem(pathname: string): NavItem | undefined {
  for (const g of NAV) {
    for (const i of g.items) {
      if (pathname === i.href || pathname.startsWith(i.href + '/')) return i;
    }
  }
  return undefined;
}
