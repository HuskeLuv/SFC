-- CreateTable
CREATE TABLE "portfolio_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetEquity" DECIMAL(15,2) NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_goals_userId_key" ON "portfolio_goals"("userId");

-- AddForeignKey
ALTER TABLE "portfolio_goals" ADD CONSTRAINT "portfolio_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
