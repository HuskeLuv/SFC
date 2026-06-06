-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'consultant', 'admin');

-- CreateEnum
CREATE TYPE "ConsultantClientStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ConsultantInviteStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "FixedIncomeType" AS ENUM ('CDB_PRE', 'LC_PRE', 'LCI_PRE', 'LCA_PRE', 'RDB_PRE', 'LF_PRE', 'LFS_PRE', 'CRI_PRE', 'CRA_PRE', 'DPGE_PRE', 'RDC_PRE', 'LIG_PRE', 'CDB_HIB', 'LC_HIB', 'LCI_HIB', 'LCA_HIB', 'RDB_HIB', 'LF_HIB', 'LFS_HIB', 'CRI_HIB', 'CRA_HIB', 'DPGE_HIB', 'RDC_HIB', 'LIG_HIB');

-- CreateEnum
CREATE TYPE "FixedIncomeIndexer" AS ENUM ('PRE', 'CDI', 'IPCA');

-- CreateEnum
CREATE TYPE "FixedIncomeLiquidity" AS ENUM ('DAILY', 'MATURITY');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('ATIVA', 'INATIVA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientConsultant" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ConsultantClientStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "ClientConsultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantInvite" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "email" TEXT NOT NULL,
    "status" "ConsultantInviteStatus" NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ConsultantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DashboardData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alocacao_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "minimo" DOUBLE PRECISION NOT NULL,
    "maximo" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alocacao_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "forma_pagamento" TEXT NOT NULL,
    "pago" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "significado" TEXT,
    "rank" TEXT,
    "templateId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowValue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "color" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashflowValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "totalInvested" DOUBLE PRECISION NOT NULL,
    "objetivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estrategia" TEXT,
    "tipoFii" TEXT,
    "regiaoEtf" TEXT,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_proventos" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataCom" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "precificarPor" TEXT NOT NULL DEFAULT 'valor',
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "quantidadeBase" DOUBLE PRECISION NOT NULL,
    "impostoRenda" DOUBLE PRECISION,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_proventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fees" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'brapi',
    "currentPrice" DECIMAL(18,6),
    "priceUpdatedAt" TIMESTAMP(3),
    "cnpj" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_price_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "currency" TEXT,
    "source" TEXT NOT NULL DEFAULT 'BRAPI',
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_dividend_history" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dataCom" TIMESTAMP(3),
    "tipo" TEXT NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BRAPI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_dividend_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_corporate_actions" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "completeFactor" TEXT,
    "isinCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'BRAPI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_corporate_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_fundamentals" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "priceEarnings" DOUBLE PRECISION,
    "beta" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_fundamentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_price_logs" (
    "id" TEXT NOT NULL,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "totalInserted" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_price_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_income_assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "FixedIncomeType" NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "investedAmount" DOUBLE PRECISION NOT NULL,
    "annualRate" DOUBLE PRECISION NOT NULL,
    "indexer" "FixedIncomeIndexer",
    "indexerPercent" DOUBLE PRECISION,
    "liquidityType" "FixedIncomeLiquidity",
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "tesouroBondType" TEXT,
    "tesouroMaturity" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_income_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "status" "InstitutionStatus" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_impersonation_logs" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_impersonation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_cumulative_returns" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "benchmarkType" TEXT NOT NULL,
    "cumulativeReturn" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_cumulative_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economic_indexes" (
    "id" TEXT NOT NULL,
    "indexType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economic_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicator_cache" (
    "id" TEXT NOT NULL,
    "indicatorKey" TEXT NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "changePercent" DECIMAL(10,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_indicator_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_daily_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalValue" DECIMAL(18,4) NOT NULL,
    "totalInvested" DECIMAL(18,4) NOT NULL,
    "totalEarnings" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_sensibilidade_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowMonths" INTEGER NOT NULL,
    "portfolioHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_sensibilidade_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_risco_retorno_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_risco_retorno_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetEquity" DECIMAL(15,2) NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_performance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dailyReturn" DECIMAL(14,8),
    "cumulativeReturn" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesouro_direto_prices" (
    "id" TEXT NOT NULL,
    "bondType" TEXT NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "baseDate" TIMESTAMP(3) NOT NULL,
    "buyRate" DECIMAL(10,6),
    "sellRate" DECIMAL(10,6),
    "buyPU" DECIMAL(18,6),
    "sellPU" DECIMAL(18,6),
    "basePU" DECIMAL(18,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesouro_direto_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cvm_fund_quotas" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quotaValue" DECIMAL(18,8) NOT NULL,
    "netWorth" DECIMAL(18,2),
    "totalValue" DECIMAL(18,2),
    "shareholders" INTEGER,
    "dailyInflow" DECIMAL(18,2),
    "dailyOutflow" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cvm_fund_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planejamento_objetivos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DECIMAL(15,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "startDate" TEXT,
    "available" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planejamento_objetivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planejamento_objetivo_entries" (
    "id" TEXT NOT NULL,
    "objetivoId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "aporte" DECIMAL(15,2) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planejamento_objetivo_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aposentadoria_planos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idade" INTEGER NOT NULL,
    "apos" INTEGER NOT NULL,
    "vida" INTEGER NOT NULL,
    "rentNom" DECIMAL(6,3) NOT NULL,
    "inflacao" DECIMAL(6,3) NOT NULL,
    "rentNomRetiro" DECIMAL(6,3),
    "patrimonio" DECIMAL(15,2) NOT NULL,
    "aporteM" DECIMAL(15,2) NOT NULL,
    "renda" DECIMAL(15,2) NOT NULL,
    "trackStartMonth" INTEGER NOT NULL,
    "trackStartYear" INTEGER NOT NULL,
    "eventos" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aposentadoria_planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aposentadoria_plano_entries" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "off" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "aporteReal" DECIMAL(15,2) NOT NULL,
    "patFinal" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aposentadoria_plano_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "user_consents_userId_idx" ON "user_consents"("userId");

-- CreateIndex
CREATE INDEX "user_consents_userId_documentType_idx" ON "user_consents"("userId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE INDEX "ClientConsultant_clientId_idx" ON "ClientConsultant"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientConsultant_consultantId_clientId_key" ON "ClientConsultant"("consultantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantInvite_token_key" ON "ConsultantInvite"("token");

-- CreateIndex
CREATE INDEX "ConsultantInvite_invitedUserId_idx" ON "ConsultantInvite"("invitedUserId");

-- CreateIndex
CREATE INDEX "ConsultantInvite_consultantId_idx" ON "ConsultantInvite"("consultantId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_userId_idx" ON "Event"("userId");

-- CreateIndex
CREATE INDEX "DashboardData_userId_idx" ON "DashboardData"("userId");

-- CreateIndex
CREATE INDEX "alocacao_configs_userId_idx" ON "alocacao_configs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "alocacao_configs_userId_categoria_key" ON "alocacao_configs"("userId", "categoria");

-- CreateIndex
CREATE INDEX "Cashflow_userId_idx" ON "Cashflow"("userId");

-- CreateIndex
CREATE INDEX "CashflowGroup_userId_idx" ON "CashflowGroup"("userId");

-- CreateIndex
CREATE INDEX "CashflowGroup_parentId_idx" ON "CashflowGroup"("parentId");

-- CreateIndex
CREATE INDEX "CashflowGroup_templateId_idx" ON "CashflowGroup"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowGroup_userId_templateId_key" ON "CashflowGroup"("userId", "templateId");

-- CreateIndex
CREATE INDEX "CashflowItem_groupId_idx" ON "CashflowItem"("groupId");

-- CreateIndex
CREATE INDEX "CashflowItem_userId_idx" ON "CashflowItem"("userId");

-- CreateIndex
CREATE INDEX "CashflowItem_templateId_idx" ON "CashflowItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowItem_userId_templateId_key" ON "CashflowItem"("userId", "templateId");

-- CreateIndex
CREATE INDEX "CashflowValue_itemId_idx" ON "CashflowValue"("itemId");

-- CreateIndex
CREATE INDEX "CashflowValue_userId_idx" ON "CashflowValue"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CashflowValue_itemId_userId_year_month_key" ON "CashflowValue"("itemId", "userId", "year", "month");

-- CreateIndex
CREATE INDEX "watchlists_userId_idx" ON "watchlists"("userId");

-- CreateIndex
CREATE INDEX "portfolios_userId_idx" ON "portfolios"("userId");

-- CreateIndex
CREATE INDEX "portfolios_userId_assetId_idx" ON "portfolios"("userId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_userId_assetId_key" ON "portfolios"("userId", "assetId");

-- CreateIndex
CREATE INDEX "portfolio_proventos_portfolioId_idx" ON "portfolio_proventos"("portfolioId");

-- CreateIndex
CREATE INDEX "portfolio_proventos_userId_idx" ON "portfolio_proventos"("userId");

-- CreateIndex
CREATE INDEX "stock_transactions_userId_date_idx" ON "stock_transactions"("userId", "date");

-- CreateIndex
CREATE INDEX "stock_transactions_userId_assetId_date_idx" ON "stock_transactions"("userId", "assetId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "assets_symbol_key" ON "assets"("symbol");

-- CreateIndex
CREATE INDEX "assets_symbol_idx" ON "assets"("symbol");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "assets_source_idx" ON "assets"("source");

-- CreateIndex
CREATE INDEX "assets_cnpj_idx" ON "assets"("cnpj");

-- CreateIndex
CREATE INDEX "asset_price_history_symbol_date_idx" ON "asset_price_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "asset_price_history_symbol_idx" ON "asset_price_history"("symbol");

-- CreateIndex
CREATE INDEX "asset_price_history_date_idx" ON "asset_price_history"("date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_price_history_symbol_date_key" ON "asset_price_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "asset_dividend_history_symbol_idx" ON "asset_dividend_history"("symbol");

-- CreateIndex
CREATE INDEX "asset_dividend_history_symbol_date_idx" ON "asset_dividend_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "asset_dividend_history_symbol_dataCom_idx" ON "asset_dividend_history"("symbol", "dataCom");

-- CreateIndex
CREATE UNIQUE INDEX "asset_dividend_history_symbol_date_tipo_key" ON "asset_dividend_history"("symbol", "date", "tipo");

-- CreateIndex
CREATE INDEX "asset_corporate_actions_symbol_idx" ON "asset_corporate_actions"("symbol");

-- CreateIndex
CREATE INDEX "asset_corporate_actions_symbol_date_idx" ON "asset_corporate_actions"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_corporate_actions_symbol_date_type_key" ON "asset_corporate_actions"("symbol", "date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "asset_fundamentals_symbol_key" ON "asset_fundamentals"("symbol");

-- CreateIndex
CREATE INDEX "sync_price_logs_executedAt_idx" ON "sync_price_logs"("executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_income_assets_assetId_key" ON "fixed_income_assets"("assetId");

-- CreateIndex
CREATE INDEX "fixed_income_assets_userId_idx" ON "fixed_income_assets"("userId");

-- CreateIndex
CREATE INDEX "fixed_income_assets_assetId_idx" ON "fixed_income_assets"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_codigo_key" ON "institutions"("codigo");

-- CreateIndex
CREATE INDEX "institutions_codigo_idx" ON "institutions"("codigo");

-- CreateIndex
CREATE INDEX "institutions_cnpj_idx" ON "institutions"("cnpj");

-- CreateIndex
CREATE INDEX "institutions_status_idx" ON "institutions"("status");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_consultantId_idx" ON "consultant_impersonation_logs"("consultantId");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_clientId_idx" ON "consultant_impersonation_logs"("clientId");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_createdAt_idx" ON "consultant_impersonation_logs"("createdAt");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_action_idx" ON "consultant_impersonation_logs"("action");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_sessionToken_idx" ON "consultant_impersonation_logs"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_sessions_sessionToken_key" ON "impersonation_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "impersonation_sessions_consultantId_idx" ON "impersonation_sessions"("consultantId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_sessionToken_idx" ON "impersonation_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "impersonation_sessions_expiresAt_idx" ON "impersonation_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_benchmarkType_idx" ON "benchmark_cumulative_returns"("benchmarkType");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_date_idx" ON "benchmark_cumulative_returns"("date");

-- CreateIndex
CREATE INDEX "benchmark_cumulative_returns_benchmarkType_date_idx" ON "benchmark_cumulative_returns"("benchmarkType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_cumulative_returns_benchmarkType_date_key" ON "benchmark_cumulative_returns"("benchmarkType", "date");

-- CreateIndex
CREATE INDEX "economic_indexes_indexType_idx" ON "economic_indexes"("indexType");

-- CreateIndex
CREATE INDEX "economic_indexes_date_idx" ON "economic_indexes"("date");

-- CreateIndex
CREATE INDEX "economic_indexes_indexType_date_idx" ON "economic_indexes"("indexType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "economic_indexes_indexType_date_key" ON "economic_indexes"("indexType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "market_indicator_cache_indicatorKey_key" ON "market_indicator_cache"("indicatorKey");

-- CreateIndex
CREATE INDEX "portfolio_daily_snapshots_userId_date_idx" ON "portfolio_daily_snapshots"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_daily_snapshots_userId_date_key" ON "portfolio_daily_snapshots"("userId", "date");

-- CreateIndex
CREATE INDEX "portfolio_sensibilidade_cache_userId_idx" ON "portfolio_sensibilidade_cache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_sensibilidade_cache_userId_windowMonths_key" ON "portfolio_sensibilidade_cache"("userId", "windowMonths");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_risco_retorno_cache_userId_key" ON "portfolio_risco_retorno_cache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_goals_userId_key" ON "portfolio_goals"("userId");

-- CreateIndex
CREATE INDEX "portfolio_performance_userId_date_idx" ON "portfolio_performance"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_performance_userId_date_key" ON "portfolio_performance"("userId", "date");

-- CreateIndex
CREATE INDEX "tesouro_direto_prices_bondType_maturityDate_idx" ON "tesouro_direto_prices"("bondType", "maturityDate");

-- CreateIndex
CREATE INDEX "tesouro_direto_prices_baseDate_idx" ON "tesouro_direto_prices"("baseDate");

-- CreateIndex
CREATE UNIQUE INDEX "tesouro_direto_prices_bondType_maturityDate_baseDate_key" ON "tesouro_direto_prices"("bondType", "maturityDate", "baseDate");

-- CreateIndex
CREATE INDEX "cvm_fund_quotas_cnpj_idx" ON "cvm_fund_quotas"("cnpj");

-- CreateIndex
CREATE INDEX "cvm_fund_quotas_date_idx" ON "cvm_fund_quotas"("date");

-- CreateIndex
CREATE UNIQUE INDEX "cvm_fund_quotas_cnpj_date_key" ON "cvm_fund_quotas"("cnpj", "date");

-- CreateIndex
CREATE INDEX "planejamento_objetivos_userId_idx" ON "planejamento_objetivos"("userId");

-- CreateIndex
CREATE INDEX "planejamento_objetivos_userId_category_idx" ON "planejamento_objetivos"("userId", "category");

-- CreateIndex
CREATE INDEX "planejamento_objetivo_entries_objetivoId_idx" ON "planejamento_objetivo_entries"("objetivoId");

-- CreateIndex
CREATE UNIQUE INDEX "planejamento_objetivo_entries_objetivoId_month_key" ON "planejamento_objetivo_entries"("objetivoId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "aposentadoria_planos_userId_key" ON "aposentadoria_planos"("userId");

-- CreateIndex
CREATE INDEX "aposentadoria_plano_entries_planoId_idx" ON "aposentadoria_plano_entries"("planoId");

-- CreateIndex
CREATE UNIQUE INDEX "aposentadoria_plano_entries_planoId_off_key" ON "aposentadoria_plano_entries"("planoId", "off");

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantInvite" ADD CONSTRAINT "ConsultantInvite_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantInvite" ADD CONSTRAINT "ConsultantInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ConsultantInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardData" ADD CONSTRAINT "DashboardData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alocacao_configs" ADD CONSTRAINT "alocacao_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashflow" ADD CONSTRAINT "Cashflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CashflowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CashflowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CashflowGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CashflowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowValue" ADD CONSTRAINT "CashflowValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CashflowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowValue" ADD CONSTRAINT "CashflowValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_proventos" ADD CONSTRAINT "portfolio_proventos_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_proventos" ADD CONSTRAINT "portfolio_proventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_price_history" ADD CONSTRAINT "asset_price_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_income_assets" ADD CONSTRAINT "fixed_income_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_impersonation_logs" ADD CONSTRAINT "consultant_impersonation_logs_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_impersonation_logs" ADD CONSTRAINT "consultant_impersonation_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_daily_snapshots" ADD CONSTRAINT "portfolio_daily_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_sensibilidade_cache" ADD CONSTRAINT "portfolio_sensibilidade_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_risco_retorno_cache" ADD CONSTRAINT "portfolio_risco_retorno_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_goals" ADD CONSTRAINT "portfolio_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_performance" ADD CONSTRAINT "portfolio_performance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_objetivos" ADD CONSTRAINT "planejamento_objetivos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planejamento_objetivo_entries" ADD CONSTRAINT "planejamento_objetivo_entries_objetivoId_fkey" FOREIGN KEY ("objetivoId") REFERENCES "planejamento_objetivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aposentadoria_planos" ADD CONSTRAINT "aposentadoria_planos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aposentadoria_plano_entries" ADD CONSTRAINT "aposentadoria_plano_entries_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "aposentadoria_planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

