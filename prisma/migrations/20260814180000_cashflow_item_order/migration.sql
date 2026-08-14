-- Ordem das linhas dentro de um grupo do fluxo de caixa (reordenável pelo
-- usuário). Backfill: numera os itens de cada grupo na ordem ALFABÉTICA que a
-- UI exibia até aqui (merge ordenava por name.localeCompare) — a tela não muda
-- até o usuário reordenar.

-- AlterTable
ALTER TABLE "CashflowItem" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- Backfill por grupo (template e personalizados juntos: a numeração é por
-- groupId, e cada camada só exibe os itens do próprio grupo)
UPDATE "CashflowItem" ci
SET "orderIndex" = numbered.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "groupId" ORDER BY name ASC, id ASC) AS rn
  FROM "CashflowItem"
) numbered
WHERE ci.id = numbered.id;
