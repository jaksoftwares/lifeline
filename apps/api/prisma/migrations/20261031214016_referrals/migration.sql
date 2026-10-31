-- CreateEnum
CREATE TYPE "EarlyWarningScore" AS ENUM ('NONE', 'MEWS', 'NEWS2');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'INFO_REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('EMERGENCY', 'URGENT', 'ROUTINE');

-- CreateEnum
CREATE TYPE "DeclineReason" AS ENUM ('NO_BED', 'NO_SPECIALIST', 'NO_EQUIPMENT', 'SERVICE_NOT_OFFERED', 'CLINICALLY_INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'INTERSEX', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('NOT_PREGNANT', 'PREGNANT', 'POSTPARTUM', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AgeUnit" AS ENUM ('YEARS', 'MONTHS', 'DAYS');

-- CreateEnum
CREATE TYPE "Consciousness" AS ENUM ('ALERT', 'CONFUSION', 'VOICE', 'PAIN', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('NOTE', 'INFO_REQUEST', 'INFO_RESPONSE');

-- CreateEnum
CREATE TYPE "ReferralEventType" AS ENUM ('CREATED', 'SUBMITTED', 'REQUEST_SENT', 'INFO_REQUESTED', 'INFO_PROVIDED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CANCELLED', 'ASSESSMENT_RECORDED', 'ATTACHMENT_ADDED');

-- AlterTable
ALTER TABLE "Network" ADD COLUMN     "earlyWarningScore" "EarlyWarningScore" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "referralSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "fullName" TEXT,
    "sex" "Sex" NOT NULL,
    "dateOfBirth" DATE,
    "estimatedAge" INTEGER,
    "estimatedAgeUnit" "AgeUnit",
    "nationalId" TEXT,
    "shaNumber" TEXT,
    "hospitalNumber" TEXT,
    "nextOfKinName" TEXT,
    "nextOfKinPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'DRAFT',
    "urgency" "Urgency",
    "referringInstitutionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pregnancyStatus" "PregnancyStatus",
    "gestationWeeks" INTEGER,
    "reason" TEXT,
    "clinicalSummary" TEXT,
    "provisionalDiagnosis" TEXT,
    "treatmentGiven" TEXT,
    "allergies" TEXT,
    "acceptedRequestId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralService" (
    "referralId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "ReferralService_pkey" PRIMARY KEY ("referralId","serviceId")
);

-- CreateTable
CREATE TABLE "ReferralRequest" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "declineReason" "DeclineReason",
    "responseNote" TEXT,
    "receivingDepartmentId" TEXT,
    "readyAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawReason" TEXT,

    CONSTRAINT "ReferralRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorInstitutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalAssessment" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "onSupplementalOxygen" BOOLEAN,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "heartRate" INTEGER,
    "temperature" DOUBLE PRECISION,
    "consciousness" "Consciousness",
    "bloodGlucose" DOUBLE PRECISION,
    "notes" TEXT,
    "scoreType" "EarlyWarningScore",
    "scoreTotal" INTEGER,
    "scoreBand" TEXT,
    "scoreNote" TEXT,

    CONSTRAINT "ClinicalAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByInstitutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "requestId" TEXT,
    "type" "ReferralEventType" NOT NULL,
    "actorId" TEXT,
    "institutionId" TEXT,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_reference_key" ON "Referral"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_acceptedRequestId_key" ON "Referral"("acceptedRequestId");

-- CreateIndex
CREATE INDEX "Referral_networkId_status_idx" ON "Referral"("networkId", "status");

-- CreateIndex
CREATE INDEX "Referral_referringInstitutionId_status_idx" ON "Referral"("referringInstitutionId", "status");

-- CreateIndex
CREATE INDEX "ReferralRequest_institutionId_status_idx" ON "ReferralRequest"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralRequest_referralId_institutionId_key" ON "ReferralRequest"("referralId", "institutionId");

-- CreateIndex
CREATE INDEX "ReferralMessage_requestId_createdAt_idx" ON "ReferralMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAssessment_referralId_observedAt_idx" ON "ClinicalAssessment"("referralId", "observedAt");

-- CreateIndex
CREATE INDEX "Attachment_referralId_idx" ON "Attachment"("referralId");

-- CreateIndex
CREATE INDEX "ReferralEvent_referralId_occurredAt_idx" ON "ReferralEvent"("referralId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referringInstitutionId_fkey" FOREIGN KEY ("referringInstitutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_acceptedRequestId_fkey" FOREIGN KEY ("acceptedRequestId") REFERENCES "ReferralRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralService" ADD CONSTRAINT "ReferralService_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralService" ADD CONSTRAINT "ReferralService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRequest" ADD CONSTRAINT "ReferralRequest_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRequest" ADD CONSTRAINT "ReferralRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRequest" ADD CONSTRAINT "ReferralRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRequest" ADD CONSTRAINT "ReferralRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRequest" ADD CONSTRAINT "ReferralRequest_receivingDepartmentId_fkey" FOREIGN KEY ("receivingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralMessage" ADD CONSTRAINT "ReferralMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReferralRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralMessage" ADD CONSTRAINT "ReferralMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralMessage" ADD CONSTRAINT "ReferralMessage_authorInstitutionId_fkey" FOREIGN KEY ("authorInstitutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAssessment" ADD CONSTRAINT "ClinicalAssessment_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAssessment" ADD CONSTRAINT "ClinicalAssessment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByInstitutionId_fkey" FOREIGN KEY ("uploadedByInstitutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReferralRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Referral history, messages and observations are clinical records: append-only.
CREATE FUNCTION referral_record_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER referral_event_append_only BEFORE UPDATE OR DELETE ON "ReferralEvent"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER referral_event_no_truncate BEFORE TRUNCATE ON "ReferralEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();

CREATE TRIGGER referral_message_append_only BEFORE UPDATE OR DELETE ON "ReferralMessage"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER referral_message_no_truncate BEFORE TRUNCATE ON "ReferralMessage"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();

CREATE TRIGGER clinical_assessment_append_only BEFORE UPDATE OR DELETE ON "ClinicalAssessment"
  FOR EACH ROW EXECUTE FUNCTION referral_record_block_changes();
CREATE TRIGGER clinical_assessment_no_truncate BEFORE TRUNCATE ON "ClinicalAssessment"
  FOR EACH STATEMENT EXECUTE FUNCTION referral_record_block_changes();
