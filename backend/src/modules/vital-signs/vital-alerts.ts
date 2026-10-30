export type AlertLevel = 'critical' | 'warning';

export interface VitalAlert {
  field: string;
  level: AlertLevel;
  message: string;
}

export interface VitalInput {
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  glucose?: number | null;
}

/**
 * Umbrales de referencia para atención odontológica ambulatoria en adultos.
 * "critical" = posponer procedimientos electivos y valorar derivación.
 */
export function evaluateVitals(v: VitalInput): VitalAlert[] {
  const a: VitalAlert[] = [];
  const has = (x: number | null | undefined): x is number => typeof x === 'number' && !Number.isNaN(x);

  if (has(v.systolic) && has(v.diastolic) && v.diastolic >= v.systolic) {
    a.push({ field: 'bloodPressure', level: 'warning', message: 'Diastólica ≥ sistólica: verificar la toma' });
  }
  if ((has(v.systolic) && v.systolic >= 180) || (has(v.diastolic) && v.diastolic >= 110)) {
    a.push({ field: 'bloodPressure', level: 'critical', message: 'PA ≥ 180/110: posponer tratamiento electivo y derivar' });
  } else if ((has(v.systolic) && v.systolic >= 140) || (has(v.diastolic) && v.diastolic >= 90)) {
    a.push({ field: 'bloodPressure', level: 'warning', message: 'Hipertensión: limitar vasoconstrictor y controlar' });
  } else if (has(v.systolic) && v.systolic < 90) {
    a.push({ field: 'bloodPressure', level: 'warning', message: 'Hipotensión' });
  }

  if (has(v.heartRate)) {
    if (v.heartRate > 120 || v.heartRate < 45) a.push({ field: 'heartRate', level: 'critical', message: 'Frecuencia cardíaca fuera de rango seguro' });
    else if (v.heartRate > 100) a.push({ field: 'heartRate', level: 'warning', message: 'Taquicardia' });
    else if (v.heartRate < 50) a.push({ field: 'heartRate', level: 'warning', message: 'Bradicardia' });
  }

  if (has(v.respiratoryRate) && (v.respiratoryRate > 24 || v.respiratoryRate < 10)) {
    a.push({ field: 'respiratoryRate', level: 'warning', message: 'Frecuencia respiratoria alterada' });
  }

  if (has(v.temperature)) {
    if (v.temperature >= 39) a.push({ field: 'temperature', level: 'critical', message: 'Fiebre alta (≥ 39 °C)' });
    else if (v.temperature >= 38) a.push({ field: 'temperature', level: 'warning', message: 'Fiebre (≥ 38 °C)' });
    else if (v.temperature < 35) a.push({ field: 'temperature', level: 'warning', message: 'Hipotermia' });
  }

  if (has(v.oxygenSaturation)) {
    if (v.oxygenSaturation < 90) a.push({ field: 'oxygenSaturation', level: 'critical', message: 'SpO₂ < 90 %' });
    else if (v.oxygenSaturation < 94) a.push({ field: 'oxygenSaturation', level: 'warning', message: 'SpO₂ baja (< 94 %)' });
  }

  if (has(v.glucose)) {
    if (v.glucose < 70) a.push({ field: 'glucose', level: 'critical', message: 'Hipoglucemia (< 70 mg/dL)' });
    else if (v.glucose > 300) a.push({ field: 'glucose', level: 'critical', message: 'Hiperglucemia severa (> 300 mg/dL)' });
    else if (v.glucose > 200) a.push({ field: 'glucose', level: 'warning', message: 'Hiperglucemia (> 200 mg/dL)' });
  }

  return a;
}

export function bmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
