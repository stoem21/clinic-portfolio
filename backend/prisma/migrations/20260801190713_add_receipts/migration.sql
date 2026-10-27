-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "buddhistYear" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerTaxId" TEXT,
    "patientHn" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "lineItems" JSONB NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "amountText" TEXT NOT NULL,
    "treatmentRecordIds" TEXT[],
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_buddhistYear_number_key" ON "Receipt"("buddhistYear", "number");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
