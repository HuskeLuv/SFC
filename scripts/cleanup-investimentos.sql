-- Script para limpar registros duplicados de investimentos
-- Remove grupos e itens de "Investimentos" criados incorretamente dentro de "Despesas"

-- 1. Deletar valores de itens em subgrupos "Investimentos" dentro de "Despesas"
DELETE FROM "CashflowValue" 
WHERE "itemId" IN (
  SELECT ci.id 
  FROM "CashflowItem" ci
  INNER JOIN "CashflowGroup" cg ON ci."groupId" = cg.id
  WHERE cg.name = 'Investimentos' 
    AND cg.type = 'Despesas'
    AND cg."parentId" IS NOT NULL
);

-- 2. Deletar itens de subgrupos "Investimentos" dentro de "Despesas"
DELETE FROM "CashflowItem" 
WHERE "groupId" IN (
  SELECT id 
  FROM "CashflowGroup"
  WHERE name = 'Investimentos' 
    AND type = 'Despesas'
    AND "parentId" IS NOT NULL
);

-- 3. Deletar subgrupos "Investimentos" dentro de "Despesas"
DELETE FROM "CashflowGroup"
WHERE name = 'Investimentos' 
  AND type = 'Despesas'
  AND "parentId" IS NOT NULL;

-- Verificar resultado
SELECT 
  'Grupos de Investimentos restantes' as tipo,
  COUNT(*) as quantidade
FROM "CashflowGroup"
WHERE name = 'Investimentos';

