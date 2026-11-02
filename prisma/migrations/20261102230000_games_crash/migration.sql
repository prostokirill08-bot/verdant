-- CreateEnum
CREATE TYPE "CrashStatus" AS ENUM ('BETTING', 'RUNNING', 'CRASHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "crashId" TEXT;

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" TEXT NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "edgeBp" INTEGER NOT NULL,
    "crashPoint" DECIMAL(14,2) NOT NULL,
    "status" "CrashStatus" NOT NULL DEFAULT 'BETTING',
    "bettingEndsAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrashRound_status_createdAt_idx" ON "CrashRound"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Round_crashId_userId_key" ON "Round"("crashId", "userId");

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_crashId_fkey" FOREIGN KEY ("crashId") REFERENCES "CrashRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

