-- CreateEnum
CREATE TYPE "CapabilityLevel" AS ENUM ('PATIENT_TRANSPORT', 'BLS', 'ALS', 'CRITICAL_CARE');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'OUT_OF_SERVICE', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "CrewQualification" AS ENUM ('DRIVER', 'EMT', 'PARAMEDIC', 'NURSE', 'CLINICAL_OFFICER', 'DOCTOR');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('AWAITING_TRANSPORT', 'AMBULANCE_ASSIGNED', 'DISPATCHED', 'AT_PICKUP', 'PATIENT_COLLECTED', 'IN_TRANSIT', 'ARRIVED', 'HANDED_OVER', 'COMPLETED', 'INTERRUPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('PROVIDER', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'RELEASED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssignmentDeclineReason" AS ENUM ('NO_VEHICLE', 'NO_CREW', 'VEHICLE_UNSUITABLE', 'TOO_FAR', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalTransportService" AS ENUM ('NATIONAL_922', 'COUNTY_AMBULANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferEventType" AS ENUM ('REQUESTED', 'UPDATED', 'OFFERED', 'OFFER_WITHDRAWN', 'CONFIRMED', 'DECLINED', 'REASSIGNED', 'RELEASED', 'EXTERNAL_ARRANGED', 'DISPATCHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Network" ADD COLUMN     "vehicleStatusStaleAfterMinutes" INTEGER NOT NULL DEFAULT 720;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "callSign" TEXT,
    "capability" "CapabilityLevel" NOT NULL,
    "equipment" TEXT[],
    "status" "VehicleStatus" NOT NULL DEFAULT 'OFF_DUTY',
    "statusNote" TEXT,
    "statusUpdatedAt" TIMESTAMP(3),
    "statusUpdatedById" TEXT,
    "baseName" TEXT,
    "baseLatitude" DOUBLE PRECISION,
    "baseLongitude" DOUBLE PRECISION,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "qualification" "CrewQualification" NOT NULL,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'AWAITING_TRANSPORT',
    "pickupInstitutionId" TEXT NOT NULL,
    "destinationInstitutionId" TEXT NOT NULL,
    "requiredCapability" "CapabilityLevel" NOT NULL,
    "requiredEquipment" TEXT[],
    "readyAt" TIMESTAMP(3),
    "notes" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchAssignment" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "providerId" TEXT,
    "vehicleId" TEXT,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "declineReason" "AssignmentDeclineReason",
    "responseNote" TEXT,
    "etaMinutes" INTEGER,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "externalService" "ExternalTransportService",
    "externalProvider" TEXT,
    "externalVehicle" TEXT,
    "externalPhone" TEXT,

    CONSTRAINT "DispatchAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentCrew" (
    "assignmentId" TEXT NOT NULL,
    "crewMemberId" TEXT NOT NULL,

    CONSTRAINT "AssignmentCrew_pkey" PRIMARY KEY ("assignmentId","crewMemberId")
);

-- CreateTable
CREATE TABLE "TransferEvent" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "type" "TransferEventType" NOT NULL,
    "actorId" TEXT,
    "institutionId" TEXT,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_institutionId_idx" ON "Vehicle"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_networkId_registration_key" ON "Vehicle"("networkId", "registration");

-- CreateIndex
CREATE INDEX "CrewMember_institutionId_idx" ON "CrewMember"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_institutionId_userId_key" ON "CrewMember"("institutionId", "userId");

-- CreateIndex
CREATE INDEX "Transfer_networkId_status_idx" ON "Transfer"("networkId", "status");

-- CreateIndex
CREATE INDEX "Transfer_pickupInstitutionId_status_idx" ON "Transfer"("pickupInstitutionId", "status");

-- CreateIndex
CREATE INDEX "Transfer_destinationInstitutionId_status_idx" ON "Transfer"("destinationInstitutionId", "status");

-- CreateIndex
CREATE INDEX "DispatchAssignment_transferId_idx" ON "DispatchAssignment"("transferId");

-- CreateIndex
CREATE INDEX "DispatchAssignment_providerId_status_idx" ON "DispatchAssignment"("providerId", "status");

-- CreateIndex
CREATE INDEX "DispatchAssignment_vehicleId_status_idx" ON "DispatchAssignment"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "AssignmentCrew_crewMemberId_idx" ON "AssignmentCrew"("crewMemberId");

-- CreateIndex
CREATE INDEX "TransferEvent_transferId_occurredAt_idx" ON "TransferEvent"("transferId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_statusUpdatedById_fkey" FOREIGN KEY ("statusUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_pickupInstitutionId_fkey" FOREIGN KEY ("pickupInstitutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinationInstitutionId_fkey" FOREIGN KEY ("destinationInstitutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCrew" ADD CONSTRAINT "AssignmentCrew_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DispatchAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCrew" ADD CONSTRAINT "AssignmentCrew_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DispatchAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferEvent" ADD CONSTRAINT "TransferEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One open transfer per referral. A cancelled transfer can be followed by a new one.
CREATE UNIQUE INDEX "Transfer_open_per_referral" ON "Transfer"("referralId")
  WHERE "status" <> 'CANCELLED';

-- Offers go to one provider at a time, so two ambulances are never sent for the same patient.
CREATE UNIQUE INDEX "DispatchAssignment_open_per_transfer" ON "DispatchAssignment"("transferId")
  WHERE "status" IN ('PROPOSED', 'CONFIRMED');

-- A vehicle can be confirmed for only one trip at a time.
CREATE UNIQUE INDEX "DispatchAssignment_confirmed_per_vehicle" ON "DispatchAssignment"("vehicleId")
  WHERE "status" = 'CONFIRMED';

-- Provider assignments name a provider; external ones name the service used.
ALTER TABLE "DispatchAssignment" ADD CONSTRAINT "DispatchAssignment_kind_fields" CHECK (
  ("kind" = 'PROVIDER' AND "providerId" IS NOT NULL AND "externalService" IS NULL)
  OR ("kind" = 'EXTERNAL' AND "providerId" IS NULL AND "vehicleId" IS NULL AND "externalService" IS NOT NULL)
);

-- Transfer history is an operational record: append-only.
CREATE TRIGGER transfer_event_append_only BEFORE UPDATE OR DELETE ON "TransferEvent"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER transfer_event_no_truncate BEFORE TRUNCATE ON "TransferEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
