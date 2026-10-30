/**
 * Cruce de medicamentos contra las alergias registradas en la anamnesis (RF-02).
 * Cubre los grupos más usados en odontología. No reemplaza el criterio clínico.
 */
export interface DrugFamily {
  name: string;
  /** Términos que, si aparecen en las alergias del paciente, indican alergia a la familia */
  allergyTerms: RegExp;
  /** Medicamentos de la familia */
  drugs: RegExp;
}

export const DRUG_FAMILIES: DrugFamily[] = [
  {
    name: 'Penicilinas / betalactámicos',
    allergyTerms: /penicil|amoxic|ampicil|betalact|dicloxa/i,
    drugs: /penicil|amoxic|ampicil|dicloxa|oxacil|clavul|piperacil/i,
  },
  {
    name: 'Cefalosporinas',
    allergyTerms: /cefal|cef[aeiou]/i,
    drugs: /cef[aeiou]|cefal/i,
  },
  {
    name: 'AINEs',
    allergyTerms: /aine|antiinflamatorio|ibupro|aspirin|acetilsalic|diclofen|naprox|ketorol|nimesul|metamiz|dipiron/i,
    drugs: /ibupro|aspirin|acetilsalic|diclofen|naprox|ketorol|nimesul|meloxic|piroxic|celecox|etoricox|metamiz|dipiron/i,
  },
  {
    name: 'Macrólidos',
    allergyTerms: /macr[oó]lid|eritromic|azitromic|claritromic/i,
    drugs: /eritromic|azitromic|claritromic/i,
  },
  {
    name: 'Lincosamidas',
    allergyTerms: /clindamic|lincomic/i,
    drugs: /clindamic|lincomic/i,
  },
  {
    name: 'Sulfas',
    allergyTerms: /sulfa|sulfonamid|trimetoprim|cotrimox/i,
    drugs: /sulfa|trimetoprim|cotrimox/i,
  },
  {
    name: 'Metronidazol',
    allergyTerms: /metronid/i,
    drugs: /metronid/i,
  },
  {
    name: 'Anestésicos tipo amida',
    allergyTerms: /lidoca|artica|mepiva|prilocaí?na|bupiva|anest[eé]sico/i,
    drugs: /lidoca|artica|mepiva|priloca|bupiva/i,
  },
];

export interface AllergyConflict {
  medication: string;
  family: string;
}

export function findAllergyConflicts(allergies: string | null | undefined, medications: string[]): AllergyConflict[] {
  const text = (allergies || '').trim();
  if (!text || /^(no|ningun[oa]?|niega|n\/a|-|no refiere)$/i.test(text)) return [];
  const conflicts: AllergyConflict[] = [];
  for (const med of medications) {
    for (const fam of DRUG_FAMILIES) {
      if (fam.allergyTerms.test(text) && fam.drugs.test(med)) {
        conflicts.push({ medication: med, family: fam.name });
      }
    }
  }
  return conflicts;
}

/** Pacientes anticoagulados: advertencia (no bloqueo) al recetar AINEs. */
export function findAnticoagulantWarnings(medicationsHistory: string | null | undefined, coagulopathies: string | null | undefined, newDrugs: string[]) {
  const anticoag = /warfar|acenocum|sintrom|heparin|apixab|rivaroxab|dabigat|clopidog|anticoag/i;
  const history = `${medicationsHistory || ''} ${coagulopathies || ''}`;
  if (!anticoag.test(history)) return [];
  const aines = DRUG_FAMILIES.find((f) => f.name === 'AINEs')!.drugs;
  return newDrugs.filter((d) => aines.test(d)).map((d) => `${d}: paciente anticoagulado, riesgo de sangrado con AINEs`);
}
