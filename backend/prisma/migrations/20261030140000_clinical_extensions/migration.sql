-- SIGO-Dental: adendas (RF-05/RN-01), recetas, signos vitales y archivos (S3)

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'ANNULLED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('RX_PANORAMICA', 'RX_PERIAPICAL', 'RX_OTRA', 'FOTO_INTRAORAL', 'FOTO_EXTRAORAL', 'DOCUMENTO', 'OTRO');

-- CreateTable
CREATE TABLE "clinical_note_addenda" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_addenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "diagnosis" TEXT,
    "indications" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "allergyOverride" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureData" TEXT NOT NULL,
    "annulledAt" TIMESTAMP(3),
    "annulReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "presentation" TEXT,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT 'Oral',
    "quantity" TEXT,
    "instructions" TEXT,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_signs" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "recordedById" TEXT NOT NULL,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperature" DECIMAL(4,1),
    "oxygenSaturation" INTEGER,
    "glucose" INTEGER,
    "weightKg" DECIMAL(5,1),
    "heightCm" DECIMAL(5,1),
    "alerts" JSONB,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_files" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_note_addenda_noteId_createdAt_idx" ON "clinical_note_addenda"("noteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_number_key" ON "prescriptions"("number");

-- CreateIndex
CREATE INDEX "prescriptions_patientId_createdAt_idx" ON "prescriptions"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "prescriptions_doctorId_createdAt_idx" ON "prescriptions"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "vital_signs_patientId_recordedAt_idx" ON "vital_signs"("patientId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "patient_files_storageKey_key" ON "patient_files"("storageKey");

-- CreateIndex
CREATE INDEX "patient_files_patientId_createdAt_idx" ON "patient_files"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "clinical_note_addenda" ADD CONSTRAINT "clinical_note_addenda_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "clinical_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_addenda" ADD CONSTRAINT "clinical_note_addenda_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_files" ADD CONSTRAINT "patient_files_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_files" ADD CONSTRAINT "patient_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- RN-01: inmutabilidad del historial clínico a nivel de base de datos
-- (aunque alguien use la BD directamente, no puede borrar ni reescribir)
-- =====================================================================

CREATE OR REPLACE FUNCTION sigo_forbid_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RN-01: % no permitido en % (registro clínico inmutable)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Adendas, ítems de receta y signos vitales: solo INSERT
CREATE TRIGGER clinical_note_addenda_immutable BEFORE UPDATE OR DELETE ON "clinical_note_addenda"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();
CREATE TRIGGER prescription_items_immutable BEFORE UPDATE OR DELETE ON "prescription_items"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();
CREATE TRIGGER vital_signs_immutable BEFORE UPDATE OR DELETE ON "vital_signs"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();
CREATE TRIGGER patient_files_no_delete BEFORE DELETE ON "patient_files"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();
CREATE TRIGGER clinical_notes_no_delete BEFORE DELETE ON "clinical_notes"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();
CREATE TRIGGER prescriptions_no_delete BEFORE DELETE ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION sigo_forbid_change();

-- Notas SOEP bloqueadas: no se puede cambiar el contenido; firmadas: no se puede re-firmar
CREATE OR REPLACE FUNCTION sigo_guard_clinical_note()
RETURNS trigger AS $$
BEGIN
  IF OLD."isLocked" AND (
       NEW."subjective" IS DISTINCT FROM OLD."subjective" OR
       NEW."objective"  IS DISTINCT FROM OLD."objective"  OR
       NEW."evaluation" IS DISTINCT FROM OLD."evaluation" OR
       NEW."plan"       IS DISTINCT FROM OLD."plan"       OR
       NEW."patientId"  IS DISTINCT FROM OLD."patientId"  OR
       NEW."authorId"   IS DISTINCT FROM OLD."authorId"   OR
       NOT NEW."isLocked") THEN
    RAISE EXCEPTION 'RN-01: la nota % está bloqueada; use una adenda', OLD."id";
  END IF;
  IF OLD."signedAt" IS NOT NULL AND (
       NEW."signedAt" IS DISTINCT FROM OLD."signedAt" OR
       NEW."signatureData" IS DISTINCT FROM OLD."signatureData") THEN
    RAISE EXCEPTION 'RN-01: la firma de la nota % no puede modificarse', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clinical_notes_guard BEFORE UPDATE ON "clinical_notes"
  FOR EACH ROW EXECUTE FUNCTION sigo_guard_clinical_note();

-- Recetas: solo se puede anular (status/annulledAt/annulReason)
CREATE OR REPLACE FUNCTION sigo_guard_prescription()
RETURNS trigger AS $$
BEGIN
  IF NEW."patientId" IS DISTINCT FROM OLD."patientId" OR
     NEW."doctorId" IS DISTINCT FROM OLD."doctorId" OR
     NEW."number" IS DISTINCT FROM OLD."number" OR
     NEW."diagnosis" IS DISTINCT FROM OLD."diagnosis" OR
     NEW."indications" IS DISTINCT FROM OLD."indications" OR
     NEW."signatureData" IS DISTINCT FROM OLD."signatureData" OR
     NEW."signedAt" IS DISTINCT FROM OLD."signedAt" OR
     (OLD."status" = 'ANNULLED' AND NEW."status" <> 'ANNULLED') THEN
    RAISE EXCEPTION 'RN-01: la receta % solo puede anularse', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prescriptions_guard BEFORE UPDATE ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION sigo_guard_prescription();

-- Citas atendidas (procedimiento "Realizado"): no se pueden borrar ni des-atender
CREATE OR REPLACE FUNCTION sigo_guard_attended_appointment()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ATENDIDO' THEN
      RAISE EXCEPTION 'RN-01: la cita % fue atendida y no puede borrarse', OLD."id";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'ATENDIDO' AND NEW."status" <> 'ATENDIDO' THEN
    RAISE EXCEPTION 'RN-01: la cita % ya fue atendida; registre una adenda', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_attended_guard BEFORE UPDATE OR DELETE ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION sigo_guard_attended_appointment();
