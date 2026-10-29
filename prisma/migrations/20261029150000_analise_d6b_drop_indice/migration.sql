-- A3 / D6-b, passo 3 (DESTRUTIVO, com OK do Wellington): apaga o banco do Índice MF.
-- Pré-requisitos: passo 1 em prod (código sem as colunas) + 2 ciclos do cron + p25 (pg_dump de
-- asset_scores/analise_quadro_linhas/analise_job_runs em /var/tmp/d6b-antes.dump e no S3).
-- scoring_params fica: múltiplos, sanidade, universo, pares e financeiras ainda leem o JSON.
-- Reverter: pg_restore -t asset_scores do dump; as colunas voltam com ADD COLUMN + UPDATE a partir
-- de uma restauração do dump em banco auxiliar.
DROP TABLE IF EXISTS "asset_scores";

ALTER TABLE "analise_quadro_linhas"
  DROP COLUMN IF EXISTS "temScore",
  DROP COLUMN IF EXISTS "estadoIndice",
  DROP COLUMN IF EXISTS "indiceMf",
  DROP COLUMN IF EXISTS "criteriosAtendidos",
  DROP COLUMN IF EXISTS "criteriosAplicaveis",
  DROP COLUMN IF EXISTS "statusCriterios";
