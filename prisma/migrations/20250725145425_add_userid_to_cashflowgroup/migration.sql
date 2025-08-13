/*
  Warnings:

  - Added the required column `userId` to the `CashflowGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CashflowGroup" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "CashflowGroup_userId_idx" ON "CashflowGroup"("userId");

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
