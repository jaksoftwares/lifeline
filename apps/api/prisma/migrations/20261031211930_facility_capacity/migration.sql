-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('PUBLIC', 'PRIVATE', 'FAITH_BASED', 'NGO');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('BED', 'EQUIPMENT', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CapacitySource" AS ENUM ('MANUAL', 'INTEGRATION');

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "address" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "ownership" "Ownership",
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Network" ADD COLUMN     "capacityStaleAfterMinutes" INTEGER NOT NULL DEFAULT 240;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityService" (
    "institutionId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityService_pkey" PRIMARY KEY ("institutionId","serviceId")
);

-- CreateTable
CREATE TABLE "CapacityResource" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CapacityResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityResource" (
    "institutionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "AvailabilityStatus",
    "available" INTEGER,
    "total" INTEGER,
    "note" TEXT,
    "source" "CapacitySource",
    "updatedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityResource_pkey" PRIMARY KEY ("institutionId","resourceId")
);

-- CreateTable
CREATE TABLE "CapacityUpdate" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "available" INTEGER,
    "total" INTEGER,
    "note" TEXT,
    "source" "CapacitySource" NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapacityUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_networkId_code_key" ON "Service"("networkId", "code");

-- CreateIndex
CREATE INDEX "FacilityService_serviceId_idx" ON "FacilityService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityResource_networkId_code_key" ON "CapacityResource"("networkId", "code");

-- CreateIndex
CREATE INDEX "FacilityResource_resourceId_status_idx" ON "FacilityResource"("resourceId", "status");

-- CreateIndex
CREATE INDEX "CapacityUpdate_institutionId_resourceId_recordedAt_idx" ON "CapacityUpdate"("institutionId", "resourceId", "recordedAt");

-- CreateIndex
CREATE INDEX "Department_institutionId_idx" ON "Department"("institutionId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityService" ADD CONSTRAINT "FacilityService_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityService" ADD CONSTRAINT "FacilityService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityResource" ADD CONSTRAINT "CapacityResource_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityResource" ADD CONSTRAINT "FacilityResource_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityResource" ADD CONSTRAINT "FacilityResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CapacityResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityResource" ADD CONSTRAINT "FacilityResource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityUpdate" ADD CONSTRAINT "CapacityUpdate_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityUpdate" ADD CONSTRAINT "CapacityUpdate_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CapacityResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityUpdate" ADD CONSTRAINT "CapacityUpdate_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Capacity history is append-only: who reported what, and when, must stay traceable.
CREATE FUNCTION capacity_update_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CapacityUpdate is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capacity_update_no_update_delete
  BEFORE UPDATE OR DELETE ON "CapacityUpdate"
  FOR EACH ROW EXECUTE FUNCTION capacity_update_block_changes();

CREATE TRIGGER capacity_update_no_truncate
  BEFORE TRUNCATE ON "CapacityUpdate"
  FOR EACH STATEMENT EXECUTE FUNCTION capacity_update_block_changes();
