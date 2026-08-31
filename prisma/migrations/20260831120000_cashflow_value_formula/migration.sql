-- Célula do Fluxo de Caixa com memória de fórmula estilo Excel
-- (=200+30+50 exibe 280,00; editar mostra a fórmula) — ticket 31/08/2026.
ALTER TABLE "CashflowValue" ADD COLUMN "formula" TEXT;
