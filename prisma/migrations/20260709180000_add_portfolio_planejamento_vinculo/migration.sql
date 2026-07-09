-- AlterTable
ALTER TABLE "portfolios" ADD COLUMN "planejamentoObjetivoId" TEXT,
ADD COLUMN "vinculoAposentadoria" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "portfolios_userId_planejamentoObjetivoId_idx" ON "portfolios"("userId", "planejamentoObjetivoId");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_planejamentoObjetivoId_fkey" FOREIGN KEY ("planejamentoObjetivoId") REFERENCES "planejamento_objetivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
