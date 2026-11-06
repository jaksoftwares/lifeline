-- CreateEnum
CREATE TYPE "TransportPayer" AS ENUM ('REFERRING_FACILITY', 'RECEIVING_FACILITY', 'COUNTY_GOVERNMENT', 'NATIONAL_GOVERNMENT', 'PATIENT_OR_FAMILY', 'INSURER', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransferEventType" ADD VALUE 'HANDED_OVER';
ALTER TYPE "TransferEventType" ADD VALUE 'COST_RECORDED';
ALTER TYPE "TransferEventType" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "handedOverAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "patientIdentityConfirmed" BOOLEAN NOT NULL,
    "clinicalSummaryReceived" BOOLEAN NOT NULL,
    "latestObservationsReceived" BOOLEAN NOT NULL,
    "treatmentAndAllergiesReviewed" BOOLEAN NOT NULL,
    "documentsAndResultsAddressed" BOOLEAN NOT NULL,
    "notes" TEXT,
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferCost" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payer" "TransportPayer" NOT NULL,
    "payerName" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Handover_transferId_key" ON "Handover"("transferId");

-- CreateIndex
CREATE INDEX "Handover_signedById_signedAt_idx" ON "Handover"("signedById", "signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransferCost_transferId_key" ON "TransferCost"("transferId");

-- CreateIndex
CREATE INDEX "TransferCost_recordedById_recordedAt_idx" ON "TransferCost"("recordedById", "recordedAt");

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferCost" ADD CONSTRAINT "TransferCost_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferCost" ADD CONSTRAINT "TransferCost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Handover and cost records are immutable operational evidence.
CREATE TRIGGER handover_append_only BEFORE UPDATE OR DELETE ON "Handover"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER handover_no_truncate BEFORE TRUNCATE ON "Handover"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER transfer_cost_append_only BEFORE UPDATE OR DELETE ON "TransferCost"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER transfer_cost_no_truncate BEFORE TRUNCATE ON "TransferCost"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
