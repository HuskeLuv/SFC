-- Remove os placeholders "Objetivo N" do grupo template "Planejamento Financeiro"
-- (agora os itens são provisionados por usuário a partir dos Sonhos).
-- 1) valores de overrides desses templates
DELETE FROM "CashflowValue" WHERE "itemId" IN (
  SELECT i.id FROM "CashflowItem" i
  JOIN "CashflowItem" t ON i."templateId" = t.id
  JOIN "CashflowGroup" g ON t."groupId" = g.id
  WHERE t."userId" IS NULL AND g."userId" IS NULL AND g.name = 'Planejamento Financeiro'
);
-- 2) overrides de usuário desses templates
DELETE FROM "CashflowItem" WHERE "templateId" IN (
  SELECT t.id FROM "CashflowItem" t
  JOIN "CashflowGroup" g ON t."groupId" = g.id
  WHERE t."userId" IS NULL AND g."userId" IS NULL AND g.name = 'Planejamento Financeiro'
);
-- 3) os próprios itens template
DELETE FROM "CashflowItem" WHERE id IN (
  SELECT t.id FROM "CashflowItem" t
  JOIN "CashflowGroup" g ON t."groupId" = g.id
  WHERE t."userId" IS NULL AND g."userId" IS NULL AND g.name = 'Planejamento Financeiro'
);
