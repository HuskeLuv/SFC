-- CreateTable
CREATE TABLE "scoring_params" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analise_job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'cron',
    "status" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "duracaoMs" INTEGER,
    "linhasLidas" INTEGER NOT NULL DEFAULT 0,
    "linhasGravadas" INTEGER NOT NULL DEFAULT 0,
    "rejeitadas" INTEGER NOT NULL DEFAULT 0,
    "alertas" JSONB,
    "erro" TEXT,
    "rssInicioMb" INTEGER,
    "rssPicoMb" INTEGER,
    "parametros" JSONB,
    "detalhes" JSONB,

    CONSTRAINT "analise_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analise_fonte_arquivos" (
    "url" TEXT NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "bytes" BIGINT,
    "sha256" TEXT,
    "baixadoEm" TIMESTAMP(3) NOT NULL,
    "processadoEm" TIMESTAMP(3),
    "jobUltimo" TEXT,

    CONSTRAINT "analise_fonte_arquivos_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "cvm_companies" (
    "cnpj" TEXT NOT NULL,
    "cdCvm" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "setorAtividadeFca" TEXT,
    "situacao" TEXT,
    "mesFimExercicio" INTEGER,
    "layoutFinanceiro" BOOLEAN NOT NULL DEFAULT false,
    "dataRefFca" DATE NOT NULL,
    "versaoFca" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cvm_companies_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "cvm_company_tickers" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "classeTitulo" TEXT NOT NULL,
    "classeFca" TEXT,
    "unitQtdOn" INTEGER,
    "unitQtdPn" INTEGER,
    "composicaoTexto" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "origem" TEXT NOT NULL DEFAULT 'fca',
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cvm_company_tickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_fundamentals_period" (
    "id" TEXT NOT NULL,
    "emissorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "docTipo" TEXT NOT NULL,
    "docId" TEXT,
    "accession" TEXT,
    "sourceConcept" JSONB,
    "sourceUrl" TEXT NOT NULL,
    "tipoPeriodo" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "padraoContabil" TEXT NOT NULL,
    "dtIni" DATE NOT NULL,
    "dtFim" DATE NOT NULL,
    "anoFiscal" INTEGER NOT NULL,
    "trimestreFiscal" INTEGER,
    "versao" INTEGER NOT NULL,
    "dtEntrega" DATE NOT NULL,
    "dtEntregaOriginal" DATE NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "escalaOriginal" TEXT NOT NULL,
    "receita" DECIMAL(20,2),
    "lucroBruto" DECIMAL(20,2),
    "ebit" DECIMAL(20,2),
    "depreciacaoAmortizacao" DECIMAL(20,2),
    "lucroLiquido" DECIMAL(20,2),
    "lucroAtribuivel" DECIMAL(20,2),
    "codContaLucro" TEXT,
    "ativoTotal" DECIMAL(20,2),
    "ativoCirculante" DECIMAL(20,2),
    "passivoCirculante" DECIMAL(20,2),
    "caixa" DECIMAL(20,2),
    "aplicacoesFinanceiras" DECIMAL(20,2),
    "dividaBrutaCp" DECIMAL(20,2),
    "dividaBrutaLp" DECIMAL(20,2),
    "pl" DECIMAL(20,2),
    "plControladora" DECIMAL(20,2),
    "fco" DECIMAL(20,2),
    "fci" DECIMAL(20,2),
    "fcf" DECIMAL(20,2),
    "capex" DECIMAL(20,2),
    "dividendosJcpPagos" DECIMAL(20,2),
    "dmplDeclarado" DECIMAL(20,2),
    "lpaOn" DOUBLE PRECISION,
    "lpaPn" DOUBLE PRECISION,
    "lpaEscalaCorrigida" BOOLEAN NOT NULL DEFAULT false,
    "naoSeAplica" TEXT[],
    "flags" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_fundamentals_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_statement_lines" (
    "emissorId" TEXT NOT NULL,
    "dtFim" DATE NOT NULL,
    "tipoPeriodo" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "demonstrativo" TEXT NOT NULL,
    "cdConta" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "dsConta" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "valor" DECIMAL(20,2) NOT NULL,
    "contaFixa" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "sourceConcept" TEXT,
    "accession" TEXT,

    CONSTRAINT "asset_statement_lines_pkey" PRIMARY KEY ("emissorId","dtFim","tipoPeriodo","escopo","demonstrativo","cdConta","versao")
);

-- CreateTable
CREATE TABLE "asset_share_counts" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "on" DECIMAL(20,0),
    "pn" DECIMAL(20,0),
    "tesouraria" DECIMAL(20,0),
    "total" DECIMAL(20,0),
    "fonte" TEXT NOT NULL,
    "razaoLpa" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "versaoDoc" INTEGER,
    "flags" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_share_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fii_ticker_map" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "origem" TEXT NOT NULL,
    "conferido" BOOLEAN NOT NULL DEFAULT false,
    "conferidoPor" TEXT,
    "nomeB3" TEXT,
    "razaoSocialB3" TEXT,
    "isin" TEXT,
    "motivo" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fii_ticker_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fii_monthly" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "refMonth" DATE NOT NULL,
    "versao" INTEGER NOT NULL,
    "dtEntrega" DATE,
    "vpCota" DECIMAL(18,8),
    "vpCotaRecalculado" BOOLEAN NOT NULL DEFAULT false,
    "pl" DECIMAL(20,2),
    "cotas" DECIMAL(20,4),
    "cotistas" INTEGER,
    "dyMesCvmPct" DOUBLE PRECISION,
    "rentEfetivaMesPct" DOUBLE PRECISION,
    "taxaAdmPct" DOUBLE PRECISION,
    "ativoTotal" DECIMAL(20,2),
    "passivoTotal" DECIMAL(20,2),
    "rendDistribuir" DECIMAL(20,2),
    "obrigAquisicao" DECIMAL(20,2),
    "obrigSecuritizacao" DECIMAL(20,2),
    "imoveis" DECIMAL(20,2),
    "spe" DECIMAL(20,2),
    "cri" DECIMAL(20,2),
    "lciLca" DECIMAL(20,2),
    "cotasFii" DECIMAL(20,2),
    "rendaFixa" DECIMAL(20,2),
    "acoes" DECIMAL(20,2),
    "segmentoCvm" TEXT,
    "tipoComposicao" TEXT,
    "tipoVigente" TEXT,
    "reguaVigente" TEXT,
    "obrigacoesPlPct" DOUBLE PRECISION,
    "fatorDesdobramento" DOUBLE PRECISION,
    "flags" TEXT[],
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fii_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fii_quarterly" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "refQuarter" DATE NOT NULL,
    "versao" INTEGER NOT NULL,
    "nImoveisRenda" INTEGER,
    "nImoveisOutros" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "areaMaiorImovelM2" DOUBLE PRECISION,
    "vacanciaFisicaCvmPct" DOUBLE PRECISION,
    "inadimplenciaCvmPct" DOUBLE PRECISION,
    "somaPctReceita" DOUBLE PRECISION,
    "prazoMedioAnosAprox" DOUBLE PRECISION,
    "vencAte12mPct" DOUBLE PRECISION,
    "vencAcima36mPct" DOUBLE PRECISION,
    "idxIpcaPct" DOUBLE PRECISION,
    "idxIgpmPct" DOUBLE PRECISION,
    "nCri" INTEGER,
    "valorCri" DECIMAL(20,2),
    "maiorCriPct" DOUBLE PRECISION,
    "nFii" INTEGER,
    "receitaAluguel" DECIMAL(20,2),
    "resultadoTrimestral" DECIMAL(20,2),
    "rendimentosDeclarados" DECIMAL(20,2),
    "taxaPerformance" DECIMAL(20,2),
    "flags" TEXT[],
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fii_quarterly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fii_tipo_override" (
    "cnpj" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fii_tipo_override_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "asset_quotes_daily" (
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closeRaw" DECIMAL(18,6) NOT NULL,
    "fatCot" INTEGER NOT NULL,
    "volumeFin" DECIMAL(20,2) NOT NULL,
    "quantidade" BIGINT NOT NULL,
    "negocios" INTEGER NOT NULL,
    "codBdi" TEXT NOT NULL,
    "especi" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cotahist',

    CONSTRAINT "asset_quotes_daily_pkey" PRIMARY KEY ("symbol","date")
);

-- CreateTable
CREATE TABLE "asset_quote_resumo" (
    "symbol" TEXT NOT NULL,
    "ultimoPregao" DATE NOT NULL,
    "closeRaw" DECIMAL(18,6) NOT NULL,
    "codBdi" TEXT NOT NULL,
    "especi" TEXT,
    "volumeMedio21" DECIMAL(20,2) NOT NULL,
    "pregoesComNegocio21" INTEGER NOT NULL,
    "baixaLiquidez" BOOLEAN NOT NULL,
    "negociadoUltimos30" BOOLEAN NOT NULL,
    "saltoSuspeito" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_quote_resumo_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "asset_setores_b3" (
    "raiz" TEXT NOT NULL,
    "nomePregao" TEXT,
    "setor" TEXT NOT NULL,
    "subsetor" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "segmentoListagem" TEXT,
    "presenteUltimoArquivo" BOOLEAN NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_setores_b3_pkey" PRIMARY KEY ("raiz")
);

-- CreateTable
CREATE TABLE "asset_proventos_auditados" (
    "id" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tipoOriginal" TEXT NOT NULL,
    "tipoNormalizado" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataPagamento" DATE,
    "dataExGravada" DATE,
    "dataComReal" DATE,
    "dataExOrigem" TEXT,
    "status" TEXT NOT NULL,
    "duplicataDe" TEXT,
    "fatorAjusteHoje" DOUBLE PRECISION NOT NULL,
    "valorAjustadoHoje" DOUBLE PRECISION NOT NULL,
    "flags" TEXT[],
    "auditadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_proventos_auditados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_corporate_action_checks" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT,
    "dataEvento" DATE NOT NULL,
    "fator" DECIMAL(18,8) NOT NULL,
    "tipo" TEXT NOT NULL,
    "anoBase" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "razaoCvm" DOUBLE PRECISION,
    "fatorProdutoAno" DOUBLE PRECISION,
    "idsOrigem" TEXT[],
    "fontes" TEXT[],
    "verificadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_corporate_action_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_per_share_yearly" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "anoFiscal" INTEGER NOT NULL,
    "dtFim" DATE NOT NULL,
    "acoesFim" DECIMAL(20,0),
    "fatorEquivalencia" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lpa" DOUBLE PRECISION,
    "vpa" DOUBLE PRECISION,
    "dpaDataCom" DOUBLE PRECISION,
    "fatorAjusteHoje" DOUBLE PRECISION NOT NULL,
    "lpaAjHoje" DOUBLE PRECISION,
    "vpaAjHoje" DOUBLE PRECISION,
    "dpaAjHoje" DOUBLE PRECISION,
    "payoutDmplPct" DOUBLE PRECISION,
    "payoutPorAcaoPct" DOUBLE PRECISION,
    "rendCota" DOUBLE PRECISION,
    "vpCotaFim" DOUBLE PRECISION,
    "naoSeAplica" TEXT[],
    "flags" TEXT[],
    "paramsVersion" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_per_share_yearly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_multiples_yearly" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "anoFiscal" INTEGER NOT NULL,
    "dtFim" DATE NOT NULL,
    "precoFimAno" DECIMAL(18,6),
    "precoFimAnoData" DATE,
    "valorMercadoEmpresa" DECIMAL(22,2),
    "pl" DOUBLE PRECISION,
    "pvp" DOUBLE PRECISION,
    "pReceita" DOUBLE PRECISION,
    "evEbitda" DOUBLE PRECISION,
    "pFco" DOUBLE PRECISION,
    "pFcl" DOUBLE PRECISION,
    "dyPct" DOUBLE PRECISION,
    "payoutPct" DOUBLE PRECISION,
    "margemLiquidaPct" DOUBLE PRECISION,
    "roePct" DOUBLE PRECISION,
    "roaPct" DOUBLE PRECISION,
    "roicPct" DOUBLE PRECISION,
    "divLiqEbitda" DOUBLE PRECISION,
    "divLiqPl" DOUBLE PRECISION,
    "liquidezCorrente" DOUBLE PRECISION,
    "vpCota" DOUBLE PRECISION,
    "rendCota12m" DOUBLE PRECISION,
    "obrigacoesPlPct" DOUBLE PRECISION,
    "vacanciaFisicaCvmPct" DOUBLE PRECISION,
    "nImoveisCvm" INTEGER,
    "naoSeAplica" TEXT[],
    "flags" TEXT[],
    "paramsVersion" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_multiples_yearly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_multiples_current" (
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "preco" DECIMAL(18,6) NOT NULL,
    "precoData" DATE NOT NULL,
    "ttmDtFim" DATE,
    "lpaTtm" DOUBLE PRECISION,
    "vpa" DOUBLE PRECISION,
    "dpa12m" DOUBLE PRECISION,
    "rend12m" DOUBLE PRECISION,
    "vpCota" DOUBLE PRECISION,
    "pl" DOUBLE PRECISION,
    "pvp" DOUBLE PRECISION,
    "pReceita" DOUBLE PRECISION,
    "evEbitda" DOUBLE PRECISION,
    "pFco" DOUBLE PRECISION,
    "pFcl" DOUBLE PRECISION,
    "dy12mPct" DOUBLE PRECISION,
    "payoutPct" DOUBLE PRECISION,
    "margemLiquidaPct" DOUBLE PRECISION,
    "roePct" DOUBLE PRECISION,
    "roaPct" DOUBLE PRECISION,
    "roicPct" DOUBLE PRECISION,
    "divLiqEbitda" DOUBLE PRECISION,
    "divLiqPl" DOUBLE PRECISION,
    "liquidezCorrente" DOUBLE PRECISION,
    "obrigacoesPlPct" DOUBLE PRECISION,
    "anosLucroConsecutivos" INTEGER,
    "mesesComRendimento" INTEGER,
    "plMedia10a" DOUBLE PRECISION,
    "plPontosHistorico" INTEGER NOT NULL,
    "plVsMedia10aPct" DOUBLE PRECISION,
    "naoSeAplica" TEXT[],
    "flags" TEXT[],
    "paramsVersion" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_multiples_current_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "asset_scores" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "dataRef" DATE NOT NULL,
    "classe" TEXT NOT NULL,
    "regua" TEXT NOT NULL,
    "fiiTipo" TEXT,
    "tickerReferencia" TEXT,
    "indiceMf" DOUBLE PRECISION,
    "cLucro" DOUBLE PRECISION,
    "cDivida" DOUBLE PRECISION,
    "cRent" DOUBLE PRECISION,
    "cDiv" DOUBLE PRECISION,
    "cPreco" DOUBLE PRECISION,
    "componentes" JSONB NOT NULL,
    "pesosEfetivos" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "criteriosAplicaveis" INTEGER NOT NULL,
    "criteriosAtendidos" INTEGER NOT NULL,
    "incompleto" BOOLEAN NOT NULL,
    "motivosIncompleto" TEXT[],
    "paramsVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_eventos" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "subtipo" TEXT NOT NULL,
    "periodoRef" TEXT,
    "chave" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "estimado" BOOLEAN NOT NULL,
    "substituidoEm" TIMESTAMP(3),
    "assunto" TEXT,
    "sourceUrl" TEXT,
    "sourceDocId" TEXT,
    "versao" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scoring_params_version_key" ON "scoring_params"("version");

-- CreateIndex
CREATE INDEX "scoring_params_validFrom_idx" ON "scoring_params"("validFrom");

-- CreateIndex
CREATE INDEX "analise_job_runs_job_inicio_idx" ON "analise_job_runs"("job", "inicio" DESC);

-- CreateIndex
CREATE INDEX "analise_job_runs_status_idx" ON "analise_job_runs"("status");

-- CreateIndex
CREATE INDEX "cvm_companies_cdCvm_idx" ON "cvm_companies"("cdCvm");

-- CreateIndex
CREATE INDEX "cvm_company_tickers_cnpj_idx" ON "cvm_company_tickers"("cnpj");

-- CreateIndex
CREATE INDEX "cvm_company_tickers_symbol_idx" ON "cvm_company_tickers"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "cvm_company_tickers_symbol_validFrom_key" ON "cvm_company_tickers"("symbol", "validFrom");

-- CreateIndex
CREATE INDEX "asset_fundamentals_period_emissorId_tipoPeriodo_dtFim_idx" ON "asset_fundamentals_period"("emissorId", "tipoPeriodo", "dtFim");

-- CreateIndex
CREATE INDEX "asset_fundamentals_period_fetchedAt_idx" ON "asset_fundamentals_period"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "asset_fundamentals_period_emissorId_dtFim_tipoPeriodo_escop_key" ON "asset_fundamentals_period"("emissorId", "dtFim", "tipoPeriodo", "escopo", "versao");

-- CreateIndex
CREATE INDEX "asset_share_counts_cnpj_idx" ON "asset_share_counts"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "asset_share_counts_cnpj_data_key" ON "asset_share_counts"("cnpj", "data");

-- CreateIndex
CREATE INDEX "fii_ticker_map_cnpj_idx" ON "fii_ticker_map"("cnpj");

-- CreateIndex
CREATE INDEX "fii_ticker_map_ticker_idx" ON "fii_ticker_map"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "fii_ticker_map_ticker_validFrom_key" ON "fii_ticker_map"("ticker", "validFrom");

-- CreateIndex
CREATE INDEX "fii_monthly_refMonth_idx" ON "fii_monthly"("refMonth");

-- CreateIndex
CREATE UNIQUE INDEX "fii_monthly_cnpj_refMonth_key" ON "fii_monthly"("cnpj", "refMonth");

-- CreateIndex
CREATE INDEX "fii_quarterly_refQuarter_idx" ON "fii_quarterly"("refQuarter");

-- CreateIndex
CREATE UNIQUE INDEX "fii_quarterly_cnpj_refQuarter_key" ON "fii_quarterly"("cnpj", "refQuarter");

-- CreateIndex
CREATE INDEX "asset_quotes_daily_date_idx" ON "asset_quotes_daily"("date");

-- CreateIndex
CREATE INDEX "asset_setores_b3_segmento_idx" ON "asset_setores_b3"("segmento");

-- CreateIndex
CREATE INDEX "asset_setores_b3_subsetor_idx" ON "asset_setores_b3"("subsetor");

-- CreateIndex
CREATE UNIQUE INDEX "asset_proventos_auditados_origemId_key" ON "asset_proventos_auditados"("origemId");

-- CreateIndex
CREATE INDEX "asset_proventos_auditados_symbol_dataComReal_idx" ON "asset_proventos_auditados"("symbol", "dataComReal");

-- CreateIndex
CREATE INDEX "asset_proventos_auditados_symbol_status_idx" ON "asset_proventos_auditados"("symbol", "status");

-- CreateIndex
CREATE INDEX "asset_corporate_action_checks_symbol_idx" ON "asset_corporate_action_checks"("symbol");

-- CreateIndex
CREATE INDEX "asset_corporate_action_checks_cnpj_idx" ON "asset_corporate_action_checks"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "asset_corporate_action_checks_symbol_dataEvento_fator_key" ON "asset_corporate_action_checks"("symbol", "dataEvento", "fator");

-- CreateIndex
CREATE INDEX "asset_per_share_yearly_cnpj_idx" ON "asset_per_share_yearly"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "asset_per_share_yearly_symbol_anoFiscal_key" ON "asset_per_share_yearly"("symbol", "anoFiscal");

-- CreateIndex
CREATE INDEX "asset_multiples_yearly_cnpj_idx" ON "asset_multiples_yearly"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "asset_multiples_yearly_symbol_anoFiscal_key" ON "asset_multiples_yearly"("symbol", "anoFiscal");

-- CreateIndex
CREATE INDEX "asset_multiples_current_cnpj_idx" ON "asset_multiples_current"("cnpj");

-- CreateIndex
CREATE INDEX "asset_multiples_current_classe_idx" ON "asset_multiples_current"("classe");

-- CreateIndex
CREATE INDEX "asset_scores_dataRef_idx" ON "asset_scores"("dataRef");

-- CreateIndex
CREATE INDEX "asset_scores_classe_dataRef_idx" ON "asset_scores"("classe", "dataRef");

-- CreateIndex
CREATE UNIQUE INDEX "asset_scores_symbol_dataRef_key" ON "asset_scores"("symbol", "dataRef");

-- CreateIndex
CREATE INDEX "asset_eventos_data_idx" ON "asset_eventos"("data");

-- CreateIndex
CREATE INDEX "asset_eventos_cnpj_data_idx" ON "asset_eventos"("cnpj", "data");

-- CreateIndex
CREATE UNIQUE INDEX "asset_eventos_cnpj_tipo_chave_key" ON "asset_eventos"("cnpj", "tipo", "chave");

