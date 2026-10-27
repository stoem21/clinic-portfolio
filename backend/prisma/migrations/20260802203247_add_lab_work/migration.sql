-- CreateTable
CREATE TABLE "LabWork" (
    "id" TEXT NOT NULL,
    "treatmentRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "placementDentistId" TEXT NOT NULL,
    "deliveredDentistId" TEXT,
    "cost" DECIMAL(10,2),
    "placementPaid" BOOLEAN NOT NULL DEFAULT false,
    "placementPaidAt" TIMESTAMP(3),
    "deliveredPaid" BOOLEAN NOT NULL DEFAULT false,
    "deliveredPaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabWork_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LabWork" ADD CONSTRAINT "LabWork_treatmentRecordId_fkey" FOREIGN KEY ("treatmentRecordId") REFERENCES "TreatmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabWork" ADD CONSTRAINT "LabWork_placementDentistId_fkey" FOREIGN KEY ("placementDentistId") REFERENCES "Dentist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabWork" ADD CONSTRAINT "LabWork_deliveredDentistId_fkey" FOREIGN KEY ("deliveredDentistId") REFERENCES "Dentist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
