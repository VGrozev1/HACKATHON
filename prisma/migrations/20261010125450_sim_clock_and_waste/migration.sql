-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "wastedUnits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SimState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "today" TEXT NOT NULL,
    "lastBenchmark" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimState_pkey" PRIMARY KEY ("id")
);

-- Supabase: block the public REST API (see init migration).
ALTER TABLE "SimState" ENABLE ROW LEVEL SECURITY;
