-- CreateTable
CREATE TABLE "SlotMeter" (
    "userId" TEXT NOT NULL,
    "gameSlug" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotMeter_pkey" PRIMARY KEY ("userId","gameSlug")
);

-- AddForeignKey
ALTER TABLE "SlotMeter" ADD CONSTRAINT "SlotMeter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
