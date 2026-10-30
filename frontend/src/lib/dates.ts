/** Fecha local YYYY-MM-DD (evita el desfase UTC: en Ecuador, UTC−5, toISOString() cambia de día a las 19:00). */
export function localISO(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/** Rango [inicio, fin] del día local, en ISO UTC para la API. */
export function dayRange(iso: string) {
  const start = new Date(iso + 'T00:00:00');
  const end = new Date(iso + 'T23:59:59.999');
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Lunes de la semana que contiene la fecha. */
export function weekStart(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return localISO(d);
}

export function weekDays(iso: string) {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
