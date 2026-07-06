-- CreateTable
CREATE TABLE "cashflow_patrimonio_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflow_patrimonio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashflow_patrimonio_snapshots_userId_year_month_key" ON "cashflow_patrimonio_snapshots"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "cashflow_patrimonio_snapshots_userId_year_idx" ON "cashflow_patrimonio_snapshots"("userId", "year");

-- AddForeignKey
ALTER TABLE "cashflow_patrimonio_snapshots" ADD CONSTRAINT "cashflow_patrimonio_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
