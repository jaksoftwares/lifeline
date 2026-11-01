-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('WEB', 'CREW_APP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransferEventType" ADD VALUE 'AT_PICKUP';
ALTER TYPE "TransferEventType" ADD VALUE 'PATIENT_COLLECTED';
ALTER TYPE "TransferEventType" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "TransferEventType" ADD VALUE 'ARRIVED';
ALTER TYPE "TransferEventType" ADD VALUE 'INTERRUPTED';
ALTER TYPE "TransferEventType" ADD VALUE 'RESUMED';

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "atPickupAt" TIMESTAMP(3),
ADD COLUMN     "collectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TransferEvent" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" "EventSource" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "recordedById" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationPing_transferId_recordedAt_idx" ON "LocationPing"("transferId", "recordedAt");

-- CreateIndex
CREATE INDEX "LocationPing_vehicleId_recordedAt_idx" ON "LocationPing"("vehicleId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_assignmentId_recordedAt_key" ON "LocationPing"("assignmentId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransferEvent_clientId_key" ON "TransferEvent"("clientId");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DispatchAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing history was recorded as it happened, so it was received when it occurred. The append-only
-- trigger is paused for this one backfill only.
ALTER TABLE "TransferEvent" DISABLE TRIGGER transfer_event_append_only;
UPDATE "TransferEvent" SET "receivedAt" = "occurredAt";
ALTER TABLE "TransferEvent" ENABLE TRIGGER transfer_event_append_only;

-- Positions are an operational record: append-only.
CREATE TRIGGER location_ping_append_only BEFORE UPDATE OR DELETE ON "LocationPing"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER location_ping_no_truncate BEFORE TRUNCATE ON "LocationPing"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
