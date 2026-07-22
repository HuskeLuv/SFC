-- Modelo legado de lançamentos avulsos: a planilha (CashflowGroup/Item/Value)
-- nunca escreveu aqui e o CRUD (/api/cashflow/[id]) não tinha UI. Últimos
-- leitores (resumo do consultor) migraram para a planilha. Conteúdo = só seed.
DROP TABLE IF EXISTS "Cashflow";
