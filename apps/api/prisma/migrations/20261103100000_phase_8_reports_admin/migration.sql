CREATE TABLE "VehicleStatusEvent" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL,
    "recordStatus" "RecordStatus" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleStatusEvent_vehicleId_recordedAt_idx"
    ON "VehicleStatusEvent"("vehicleId", "recordedAt");

ALTER TABLE "VehicleStatusEvent"
    ADD CONSTRAINT "VehicleStatusEvent_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "VehicleStatusEvent" ("id", "vehicleId", "status", "recordStatus", "recordedAt")
SELECT 'vehicle-status-baseline-' || "id", "id", "status", "recordStatus",
       COALESCE("statusUpdatedAt", "createdAt")
FROM "Vehicle";

CREATE TRIGGER vehicle_status_event_append_only BEFORE UPDATE OR DELETE ON "VehicleStatusEvent"
    FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER vehicle_status_event_no_truncate BEFORE TRUNCATE ON "VehicleStatusEvent"
    FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
