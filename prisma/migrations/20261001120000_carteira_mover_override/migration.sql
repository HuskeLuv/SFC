-- Mover investimentos entre abas e seções da Carteira (out/2026).
-- Aditiva: 3 colunas TEXT NULL, sem índice nem CHECK (a validação fica no zod da API).
-- categoriaOverride = aba escolhida pelo usuário, gravada SÓ quando ≠ aba base
-- (null = a aba deriva de Asset.type, como sempre). tipoFundo = subgrupo da aba Fundos.
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "categoriaOverride" TEXT;
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "tipoFundo" TEXT;
ALTER TABLE "watchlists" ADD COLUMN IF NOT EXISTS "categoriaOverride" TEXT;
