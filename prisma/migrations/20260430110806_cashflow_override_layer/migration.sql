-- AlterTable
ALTER TABLE "CashflowGroup"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CashflowItem"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CashflowGroup_templateId_idx" ON "CashflowGroup"("templateId");

-- CreateIndex
CREATE INDEX "CashflowItem_templateId_idx" ON "CashflowItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowGroup_userId_templateId_key" ON "CashflowGroup"("userId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowItem_userId_templateId_key" ON "CashflowItem"("userId", "templateId");

-- AddForeignKey
ALTER TABLE "CashflowGroup"
  ADD CONSTRAINT "CashflowGroup_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CashflowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem"
  ADD CONSTRAINT "CashflowItem_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CashflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
