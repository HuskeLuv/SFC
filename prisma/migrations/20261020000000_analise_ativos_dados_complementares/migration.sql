-- Análise de Ativos — A6, dados complementares (docs/analise-ativos/fundamentei-trazer/desenho.json,
-- fatia 0). Gerada com `prisma migrate diff` (schema da main → schema da fatia 0) e só depois
-- tornada idempotente à mão: CREATE TABLE/INDEX IF NOT EXISTS e ADD COLUMN IF NOT EXISTS de colunas
-- ANULÁVEIS (sem DEFAULT, sem NOT NULL) em tabelas que já existem. Nada é apagado, renomeado ou muda
-- de tipo; nenhuma FK. As PKs das tabelas novas com coluna que pode vir vazia (setor, classePn) usam
-- text NOT NULL DEFAULT '' (só em tabela nova; o parser normaliza o vazio).
-- Dev (Postgres local): npx prisma migrate deploy, ou
-- scripts/analise-ativos/apply-migration-dados-complementares.ts; produção: prisma migrate deploy
-- (deploy.sh).

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "pdd" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "receitaIntermediacaoDva" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "resultadoFinanceiro" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "equivalenciaPatrimonial" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "receitaComissoesServicos" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "receitaSeguro" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "despesaSeguro" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "premiosGanhos" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "sinistrosRetidos" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "outrosValoresPagar" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "valoresReceber" DECIMAL(20,2);

-- AlterTable
ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "obrigacoesAtivoPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "asset_multiples_yearly" ADD COLUMN IF NOT EXISTS "obrigacoesAtivoPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "asset_multiples_current" ADD COLUMN IF NOT EXISTS "obrigacoesAtivoPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "obrigacoesAtivoPct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "fii_imovel_trimestral" (
    "cnpj" TEXT NOT NULL,
    "refQuarter" DATE NOT NULL,
    "ordem" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "classe" TEXT,
    "nome" TEXT,
    "endereco" TEXT,
    "ufInferida" TEXT,
    "area" DECIMAL(20,2),
    "unidades" INTEGER,
    "vacanciaPct" DOUBLE PRECISION,
    "inadimplenciaPct" DOUBLE PRECISION,
    "receitaPct" DOUBLE PRECISION,
    "gravadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fii_imovel_trimestral_pkey" PRIMARY KEY ("cnpj","refQuarter","ordem")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fii_inquilino_setor_trimestral" (
    "cnpj" TEXT NOT NULL,
    "refQuarter" DATE NOT NULL,
    "setor" TEXT NOT NULL DEFAULT '',
    "versao" INTEGER NOT NULL,
    "pctReceitaFii" DOUBLE PRECISION,
    "nLinhas" INTEGER,
    "placeholder" BOOLEAN NOT NULL DEFAULT false,
    "gravadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fii_inquilino_setor_trimestral_pkey" PRIMARY KEY ("cnpj","refQuarter","setor")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "asset_retornos_cotacao" (
    "symbol" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "preco" DECIMAL(18,6),
    "ret1mPct" DOUBLE PRECISION,
    "ret12mPct" DOUBLE PRECISION,
    "ret5aAaPct" DOUBLE PRECISION,
    "ret10aAaPct" DOUBLE PRECISION,
    "precoMaxAjustado" DOUBLE PRECISION,
    "distMaxPct" DOUBLE PRECISION,
    "dataMax" DATE,
    "inicioSerie" DATE,
    "pregoes" INTEGER,
    "flags" TEXT[],
    "calculadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_retornos_cotacao_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cia_fre_posicao_acionaria" (
    "cnpj" TEXT NOT NULL,
    "anoFre" INTEGER NOT NULL,
    "idAcionista" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoPessoa" TEXT,
    "pctOn" DOUBLE PRECISION,
    "pctPn" DOUBLE PRECISION,
    "pctTotal" DOUBLE PRECISION,
    "controlador" BOOLEAN NOT NULL DEFAULT false,
    "acordoAcionistas" BOOLEAN NOT NULL DEFAULT false,
    "sintetica" BOOLEAN NOT NULL DEFAULT false,
    "dataReferencia" DATE,
    "dataUltimaAlteracao" DATE,

    CONSTRAINT "cia_fre_posicao_acionaria_pkey" PRIMARY KEY ("cnpj","anoFre","idAcionista")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cia_fre_societario" (
    "cnpj" TEXT NOT NULL,
    "anoFre" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "dtReceb" DATE,
    "dataReferencia" DATE,
    "pctCirculacaoOn" DOUBLE PRECISION,
    "pctCirculacaoPn" DOUBLE PRECISION,
    "pctCirculacaoTotal" DOUBLE PRECISION,
    "nAcionistasPf" INTEGER,
    "nAcionistasPj" INTEGER,
    "nAcionistasInst" INTEGER,
    "linkDocFre" TEXT,

    CONSTRAINT "cia_fre_societario_pkey" PRIMARY KEY ("cnpj","anoFre")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cia_fre_direito_acao" (
    "cnpj" TEXT NOT NULL,
    "anoFre" INTEGER NOT NULL,
    "especie" TEXT NOT NULL,
    "classePn" TEXT NOT NULL DEFAULT '',
    "pctTagAlong" DOUBLE PRECISION,
    "direitoDividendoTexto" TEXT,
    "pctDividendoMinimo" DOUBLE PRECISION,
    "direitoVoto" TEXT,
    "conversibilidade" TEXT,

    CONSTRAINT "cia_fre_direito_acao_pkey" PRIMARY KEY ("cnpj","anoFre","especie","classePn")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fii_imovel_trimestral_cnpj_refQuarter_idx" ON "fii_imovel_trimestral"("cnpj", "refQuarter");
