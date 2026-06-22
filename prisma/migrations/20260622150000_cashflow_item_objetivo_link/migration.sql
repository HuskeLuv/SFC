-- Vínculo sonho ↔ linha do fluxo de caixa (espelho somente-leitura do aporte).
ALTER TABLE "CashflowItem" ADD COLUMN "objetivoId" TEXT;
CREATE UNIQUE INDEX "CashflowItem_objetivoId_key" ON "CashflowItem"("objetivoId");
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_objetivoId_fkey"
  FOREIGN KEY ("objetivoId") REFERENCES "planejamento_objetivos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
