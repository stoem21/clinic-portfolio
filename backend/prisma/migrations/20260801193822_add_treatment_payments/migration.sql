-- CreateTable
CREATE TABLE "TreatmentPayment" (
    "id" TEXT NOT NULL,
    "treatmentRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TreatmentPayment" ADD CONSTRAINT "TreatmentPayment_treatmentRecordId_fkey" FOREIGN KEY ("treatmentRecordId") REFERENCES "TreatmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
