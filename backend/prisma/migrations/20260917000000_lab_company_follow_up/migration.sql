ALTER TABLE "LabWork" ADD COLUMN "companyId" TEXT;
CREATE TABLE "FollowUpCall" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "callerId" TEXT,
  "callerName" TEXT NOT NULL,
  "callDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowUpCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FollowUpCall_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FollowUpCall_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "FollowUpCall_clientId_callDate_idx" ON "FollowUpCall"("clientId", "callDate");
