-- Grupo "Dívidas" do fluxo de caixa (linhas-espelho de financiamentos) vira
-- "Despesas Financeiras" e passa a ficar ANTES do "Planejamento Financeiro"
-- (pedido ago/2026; nome alinhado à categoria da planilha-base).
-- Cobre o template (userId NULL) e as cópias personalizadas de cada usuário.

-- 1. "Dívidas" assume o orderIndex do "Planejamento Financeiro" irmão (mesmo pai/dono)
UPDATE "CashflowGroup" g
SET "orderIndex" = pf."orderIndex"
FROM "CashflowGroup" pf
WHERE g.name = 'Dívidas' AND g.type = 'despesa'
  AND pf.name = 'Planejamento Financeiro'
  AND pf."parentId" IS NOT DISTINCT FROM g."parentId"
  AND pf."userId" IS NOT DISTINCT FROM g."userId";

-- 2. "Planejamento Financeiro" desce uma posição onde existe o irmão "Dívidas"
UPDATE "CashflowGroup" pf
SET "orderIndex" = pf."orderIndex" + 1
FROM "CashflowGroup" g
WHERE pf.name = 'Planejamento Financeiro'
  AND g.name = 'Dívidas' AND g.type = 'despesa'
  AND g."parentId" IS NOT DISTINCT FROM pf."parentId"
  AND g."userId" IS NOT DISTINCT FROM pf."userId";

-- 3. Renomeia
UPDATE "CashflowGroup"
SET name = 'Despesas Financeiras'
WHERE name = 'Dívidas' AND type = 'despesa';
