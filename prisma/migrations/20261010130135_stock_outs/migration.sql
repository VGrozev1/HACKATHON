-- CreateTable
CREATE TABLE "StockOut" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StockOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockOut_slotId_startedAt_idx" ON "StockOut"("slotId", "startedAt");

-- AddForeignKey
ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase: block the public REST API (see init migration).
ALTER TABLE "StockOut" ENABLE ROW LEVEL SECURITY;
