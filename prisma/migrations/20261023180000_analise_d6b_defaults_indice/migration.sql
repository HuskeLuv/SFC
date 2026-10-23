-- A3 / D6-b, passo 1 (aditivo): o código deixa de gravar as colunas do Índice MF em
-- analise_quadro_linhas. As duas NOT NULL ganham DEFAULT para o INSERT novo funcionar enquanto as
-- colunas existem (a versão anterior continua gravando-as, então o rollback do deploy segue válido).
-- O DROP de asset_scores e das 6 colunas é uma migration SEPARADA, depois do pg_dump (D6-b, passo 2).
ALTER TABLE "analise_quadro_linhas" ALTER COLUMN "temScore" SET DEFAULT false;
ALTER TABLE "analise_quadro_linhas" ALTER COLUMN "estadoIndice" SET DEFAULT 'sem_score';
