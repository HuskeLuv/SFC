-- AlterTable
ALTER TABLE "CashflowItem" ADD COLUMN "dividaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashflowItem_dividaId_key" ON "CashflowItem"("dividaId");

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
