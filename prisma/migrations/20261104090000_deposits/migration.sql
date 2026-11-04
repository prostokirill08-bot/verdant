-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'DEPOSIT';

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_key_key" ON "Deposit"("key");
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");
CREATE INDEX "Deposit_createdAt_idx" ON "Deposit"("createdAt");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Стартовые демо-рубли отменены: баланс пополняется через кассу
UPDATE "Setting" SET "value" = jsonb_set("value"::jsonb, '{startGrant}', '0') WHERE "key" = 'platform' AND ("value"::jsonb) ? 'startGrant';
