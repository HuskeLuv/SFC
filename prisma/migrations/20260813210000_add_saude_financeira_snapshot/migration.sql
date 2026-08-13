-- CreateTable
CREATE TABLE "saude_financeira_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saude_financeira_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saude_financeira_snapshots_userId_year_month_key" ON "saude_financeira_snapshots"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "saude_financeira_snapshots_userId_year_idx" ON "saude_financeira_snapshots"("userId", "year");

-- AddForeignKey
ALTER TABLE "saude_financeira_snapshots" ADD CONSTRAINT "saude_financeira_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
