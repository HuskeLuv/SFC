-- Parte da célula do Fluxo de Caixa que veio do banco (Caixa de entrada). A partir daqui o banco
-- SOMA ao valor digitado em vez de sobrescrever a célula (ticket 06/10/2026).
ALTER TABLE "CashflowValue" ADD COLUMN "valorBanco" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Backfill: a parte do banco das células existentes = soma das transações já lançadas nelas
-- (mesma regra de recomputarCelula: |amount|, mês da data — a coluna é TIMESTAMP sem fuso, gravada em
-- UTC —, sem removidas/duplicadas).
-- `value` não muda: o que o usuário vê hoje continua igual.
UPDATE "CashflowValue" v
SET "valorBanco" = s.soma
FROM (
  SELECT t."cashflowItemId" AS item_id,
         t."userId" AS user_id,
         EXTRACT(YEAR FROM t."date")::int AS ano,
         (EXTRACT(MONTH FROM t."date")::int - 1) AS mes,
         ROUND(SUM(ABS(t."amount")), 2) AS soma
  FROM "bank_transactions" t
  WHERE t."cashflowItemId" IS NOT NULL
    AND t."deletedAt" IS NULL
    AND t."duplicadaDe" IS NULL
  GROUP BY 1, 2, 3, 4
) s
WHERE v."itemId" = s.item_id
  AND v."userId" = s.user_id
  AND v."year" = s.ano
  AND v."month" = s.mes;
