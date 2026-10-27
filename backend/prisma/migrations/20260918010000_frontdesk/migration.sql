-- CreateTable
CREATE TABLE "OpsGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "OpsGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSchedule" (
    "id" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE,
    "createdBy" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsException" (
    "id" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "replacementId" TEXT,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "OpsException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAppointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "provisionalName" TEXT NOT NULL,
    "provisionalPhone" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minute" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsCall" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvidence" (
    "id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsExpense" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "companyId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidDate" DATE NOT NULL,
    "paidTime" TEXT,
    "recipient" TEXT NOT NULL,
    "bank" TEXT,
    "reference" TEXT,
    "notes" TEXT NOT NULL,
    "evidenceId" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT true,
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "OpsExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLabLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "activeJobId" TEXT,
    "description" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "patientSnapshot" JSONB NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "jobDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OpsLabLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsGrant_userId_permission_key" ON "OpsGrant"("userId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSchedule_requestKey_key" ON "OpsSchedule"("requestKey");

-- CreateIndex
CREATE INDEX "OpsSchedule_dentistId_weekday_idx" ON "OpsSchedule"("dentistId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "OpsException_dentistId_date_key" ON "OpsException"("dentistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAppointment_requestKey_key" ON "OpsAppointment"("requestKey");

-- CreateIndex
CREATE INDEX "OpsAppointment_date_dentistId_idx" ON "OpsAppointment"("date", "dentistId");

-- CreateIndex
CREATE INDEX "OpsAppointment_clientId_date_idx" ON "OpsAppointment"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OpsCall_requestKey_key" ON "OpsCall"("requestKey");

-- CreateIndex
CREATE INDEX "OpsEvidence_hash_idx" ON "OpsEvidence"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "OpsExpense_requestKey_key" ON "OpsExpense"("requestKey");

-- CreateIndex
CREATE INDEX "OpsExpense_paidDate_idx" ON "OpsExpense"("paidDate");

-- CreateIndex
CREATE INDEX "OpsExpense_reference_idx" ON "OpsExpense"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLabLine_activeJobId_key" ON "OpsLabLine"("activeJobId");

-- AddForeignKey
ALTER TABLE "OpsAppointment" ADD CONSTRAINT "OpsAppointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAppointment" ADD CONSTRAINT "OpsAppointment_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "Dentist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsCall" ADD CONSTRAINT "OpsCall_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "OpsAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsExpense" ADD CONSTRAINT "OpsExpense_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "OpsEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsLabLine" ADD CONSTRAINT "OpsLabLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "OpsExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
