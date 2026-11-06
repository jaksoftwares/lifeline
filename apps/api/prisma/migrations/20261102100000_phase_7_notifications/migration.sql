CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS', 'PUSH', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('DELIVERED', 'UNCONFIGURED', 'FAILED');

ALTER TABLE "Network"
  ADD COLUMN "referralEscalationMinutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "ReferralRequest"
  ADD COLUMN "escalationDueAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

UPDATE "ReferralRequest" AS request
SET "escalationDueAt" = request."sentAt" + make_interval(mins => network."referralEscalationMinutes")
FROM "Referral" AS referral
JOIN "Network" AS network ON network."id" = referral."networkId"
WHERE request."referralId" = referral."id"
  AND request."status" = 'PENDING';

CREATE INDEX "ReferralRequest_status_escalationDueAt_escalatedAt_idx"
  ON "ReferralRequest"("status", "escalationDueAt", "escalatedAt");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "institutionId" TEXT,
  "recipientRole" "Role" NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL,
  "attemptedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_userId_eventKey_key"
  ON "Notification"("userId", "eventKey");
CREATE INDEX "Notification_userId_networkId_createdAt_idx"
  ON "Notification"("userId", "networkId", "createdAt");
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key"
  ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_channel_status_idx"
  ON "NotificationDelivery"("channel", "status");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_networkId_fkey"
  FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
