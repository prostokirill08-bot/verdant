-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'PROMO';

-- CreateTable
CREATE TABLE "PromoState" (
    "userId" TEXT NOT NULL,
    "keys" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PromoWin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "week" TEXT,
    "place" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoWin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoWin_createdAt_idx" ON "PromoWin"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoWin_week_place_key" ON "PromoWin"("week", "place");

-- AddForeignKey
ALTER TABLE "PromoState" ADD CONSTRAINT "PromoState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoWin" ADD CONSTRAINT "PromoWin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
