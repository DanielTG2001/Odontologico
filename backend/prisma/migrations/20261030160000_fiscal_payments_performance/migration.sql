-- SIGO-Dental: facturación electrónica SRI, pagos en línea, autorización de descuentos (RF-07)
-- e índices de rendimiento (RNF-01 / RNF-03)

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ElectronicDocStatus" AS ENUM ('FIRMADO', 'PENDIENTE_ENVIO', 'RECIBIDA', 'DEVUELTA', 'EN_PROCESAMIENTO', 'AUTORIZADO', 'NO_AUTORIZADO');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "treatment_plans"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "discountStatus" "DiscountStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discountReason" TEXT,
  ADD COLUMN "discountReviewedById" TEXT,
  ADD COLUMN "discountReviewedAt" TIMESTAMP(3),
  ADD COLUMN "discountReviewNote" TEXT;

-- CreateTable
CREATE TABLE "fiscal_sequences" (
    "id" TEXT NOT NULL,
    "codDoc" TEXT NOT NULL,
    "estab" TEXT NOT NULL,
    "ptoEmi" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_documents" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "codDoc" TEXT NOT NULL DEFAULT '01',
    "environment" TEXT NOT NULL,
    "estab" TEXT NOT NULL,
    "ptoEmi" TEXT NOT NULL,
    "sequential" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "status" "ElectronicDocStatus" NOT NULL DEFAULT 'FIRMADO',
    "signedXml" TEXT NOT NULL,
    "authorizedXml" TEXT,
    "authorizationNumber" TEXT,
    "authorizationDate" TIMESTAMP(3),
    "messages" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electronic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientTxId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "providerRef" TEXT,
    "authorizationCode" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardType" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "raw" JSONB,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_sequences_codDoc_estab_ptoEmi_key" ON "fiscal_sequences"("codDoc", "estab", "ptoEmi");
CREATE UNIQUE INDEX "electronic_documents_accessKey_key" ON "electronic_documents"("accessKey");
CREATE INDEX "electronic_documents_invoiceId_createdAt_idx" ON "electronic_documents"("invoiceId", "createdAt");
CREATE INDEX "electronic_documents_status_lastAttemptAt_idx" ON "electronic_documents"("status", "lastAttemptAt");
CREATE UNIQUE INDEX "online_payments_clientTxId_key" ON "online_payments"("clientTxId");
CREATE UNIQUE INDEX "online_payments_paymentId_key" ON "online_payments"("paymentId");
CREATE INDEX "online_payments_invoiceId_createdAt_idx" ON "online_payments"("invoiceId", "createdAt");
CREATE INDEX "online_payments_status_createdAt_idx" ON "online_payments"("status", "createdAt");
CREATE INDEX "online_payments_provider_providerRef_idx" ON "online_payments"("provider", "providerRef");
CREATE INDEX "treatment_plans_patientId_createdAt_idx" ON "treatment_plans"("patientId", "createdAt");
CREATE INDEX "treatment_plans_discountStatus_idx" ON "treatment_plans"("discountStatus");

-- Índices de rendimiento (RNF-01): facturas por paciente, cierre de caja por fecha de pago
CREATE INDEX "invoices_patientId_createdAt_idx" ON "invoices"("patientId", "createdAt");
CREATE INDEX "invoices_status_createdAt_idx" ON "invoices"("status", "createdAt");
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_discountReviewedById_fkey" FOREIGN KEY ("discountReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un comprobante AUTORIZADO por el SRI no se borra ni se reescribe (conservación 7 años)
CREATE OR REPLACE FUNCTION sigo_guard_electronic_document()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los comprobantes electrónicos no se eliminan (%).', OLD."accessKey";
  END IF;
  IF OLD."status" = 'AUTORIZADO' THEN
    RAISE EXCEPTION 'El comprobante % ya está autorizado por el SRI y es inmutable', OLD."accessKey";
  END IF;
  IF NEW."signedXml" IS DISTINCT FROM OLD."signedXml" OR NEW."accessKey" IS DISTINCT FROM OLD."accessKey" THEN
    RAISE EXCEPTION 'No se puede modificar el XML firmado ni la clave de acceso (%)', OLD."accessKey";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER electronic_documents_guard BEFORE UPDATE OR DELETE ON "electronic_documents"
  FOR EACH ROW EXECUTE FUNCTION sigo_guard_electronic_document();
