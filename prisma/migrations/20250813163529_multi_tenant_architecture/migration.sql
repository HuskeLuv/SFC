/*
  Warnings:

  - You are about to drop the `Cashflow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CashflowGroup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CashflowItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CashflowValue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DashboardData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `stock_transactions` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `stock_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CashflowType" AS ENUM ('ENTRADA', 'DESPESA');

-- CreateEnum
CREATE TYPE "CashflowStatus" AS ENUM ('PAGO', 'PENDENTE', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'DINHEIRO', 'OUTROS');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('COMPRA', 'VENDA', 'DIVIDENDO', 'JCP');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('ACAO', 'FII', 'RENDA_FIXA', 'FUNDO', 'CRYPTO', 'OUTROS');

-- DropForeignKey
ALTER TABLE "Cashflow" DROP CONSTRAINT "Cashflow_userId_fkey";

-- DropForeignKey
ALTER TABLE "CashflowGroup" DROP CONSTRAINT "CashflowGroup_parentId_fkey";

-- DropForeignKey
ALTER TABLE "CashflowGroup" DROP CONSTRAINT "CashflowGroup_userId_fkey";

-- DropForeignKey
ALTER TABLE "CashflowItem" DROP CONSTRAINT "CashflowItem_groupId_fkey";

-- DropForeignKey
ALTER TABLE "CashflowValue" DROP CONSTRAINT "CashflowValue_itemId_fkey";

-- DropForeignKey
ALTER TABLE "DashboardData" DROP CONSTRAINT "DashboardData_userId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_userId_fkey";

-- DropForeignKey
ALTER TABLE "portfolios" DROP CONSTRAINT "portfolios_stockId_fkey";

-- DropForeignKey
ALTER TABLE "portfolios" DROP CONSTRAINT "portfolios_userId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transactions" DROP CONSTRAINT "stock_transactions_stockId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transactions" DROP CONSTRAINT "stock_transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "watchlists" DROP CONSTRAINT "watchlists_stockId_fkey";

-- DropForeignKey
ALTER TABLE "watchlists" DROP CONSTRAINT "watchlists_userId_fkey";

-- AlterTable
ALTER TABLE "portfolios" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "stock_transactions" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "stock_transactions" ALTER COLUMN "type" TYPE "StockTransactionType" USING 
  CASE 
    WHEN "type" = 'compra' THEN 'COMPRA'::"StockTransactionType"
    WHEN "type" = 'venda' THEN 'VENDA'::"StockTransactionType"
    ELSE 'COMPRA'::"StockTransactionType"
  END;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "assetType" "AssetType" NOT NULL DEFAULT 'ACAO';

-- AlterTable
ALTER TABLE "watchlists" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "Cashflow";

-- DropTable
DROP TABLE "CashflowGroup";

-- DropTable
DROP TABLE "CashflowItem";

-- DropTable
DROP TABLE "CashflowValue";

-- DropTable
DROP TABLE "DashboardData";

-- DropTable
DROP TABLE "Event";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_group_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashflowType" NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cashflow_group_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "type" "CashflowType" NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "percentTotal" DOUBLE PRECISION,
    "observacoes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflow_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "significado" TEXT,
    "rank" INTEGER,
    "percentTotal" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "categoria" TEXT,
    "formaPagamento" "PaymentMethod",
    "status" "CashflowStatus" NOT NULL DEFAULT 'PENDENTE',
    "dataVencimento" TIMESTAMP(3),
    "observacoes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isInvestment" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflow_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_values" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" "CashflowStatus" NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflow_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_data" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cashflow_group_templates_name_key" ON "cashflow_group_templates"("name");

-- CreateIndex
CREATE INDEX "cashflow_group_templates_type_idx" ON "cashflow_group_templates"("type");

-- CreateIndex
CREATE INDEX "cashflow_group_templates_parentId_idx" ON "cashflow_group_templates"("parentId");

-- CreateIndex
CREATE INDEX "cashflow_group_templates_isActive_idx" ON "cashflow_group_templates"("isActive");

-- CreateIndex
CREATE INDEX "cashflow_groups_userId_idx" ON "cashflow_groups"("userId");

-- CreateIndex
CREATE INDEX "cashflow_groups_type_idx" ON "cashflow_groups"("type");

-- CreateIndex
CREATE INDEX "cashflow_groups_parentId_idx" ON "cashflow_groups"("parentId");

-- CreateIndex
CREATE INDEX "cashflow_groups_isActive_idx" ON "cashflow_groups"("isActive");

-- CreateIndex
CREATE INDEX "cashflow_groups_templateId_idx" ON "cashflow_groups"("templateId");

-- CreateIndex
CREATE INDEX "cashflow_items_userId_idx" ON "cashflow_items"("userId");

-- CreateIndex
CREATE INDEX "cashflow_items_groupId_idx" ON "cashflow_items"("groupId");

-- CreateIndex
CREATE INDEX "cashflow_items_status_idx" ON "cashflow_items"("status");

-- CreateIndex
CREATE INDEX "cashflow_items_isActive_idx" ON "cashflow_items"("isActive");

-- CreateIndex
CREATE INDEX "cashflow_items_isInvestment_idx" ON "cashflow_items"("isInvestment");

-- CreateIndex
CREATE INDEX "cashflow_values_userId_idx" ON "cashflow_values"("userId");

-- CreateIndex
CREATE INDEX "cashflow_values_itemId_idx" ON "cashflow_values"("itemId");

-- CreateIndex
CREATE INDEX "cashflow_values_mes_ano_idx" ON "cashflow_values"("mes", "ano");

-- CreateIndex
CREATE INDEX "cashflow_values_status_idx" ON "cashflow_values"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cashflow_values_userId_itemId_mes_ano_key" ON "cashflow_values"("userId", "itemId", "mes", "ano");

-- CreateIndex
CREATE INDEX "events_userId_idx" ON "events"("userId");

-- CreateIndex
CREATE INDEX "events_date_idx" ON "events"("date");

-- CreateIndex
CREATE INDEX "dashboard_data_userId_idx" ON "dashboard_data"("userId");

-- CreateIndex
CREATE INDEX "dashboard_data_metric_idx" ON "dashboard_data"("metric");

-- CreateIndex
CREATE INDEX "dashboard_data_date_idx" ON "dashboard_data"("date");

-- CreateIndex
CREATE INDEX "portfolios_userId_idx" ON "portfolios"("userId");

-- CreateIndex
CREATE INDEX "portfolios_stockId_idx" ON "portfolios"("stockId");

-- CreateIndex
CREATE INDEX "portfolios_isActive_idx" ON "portfolios"("isActive");

-- CreateIndex
CREATE INDEX "stock_transactions_userId_idx" ON "stock_transactions"("userId");

-- CreateIndex
CREATE INDEX "stock_transactions_stockId_idx" ON "stock_transactions"("stockId");

-- CreateIndex
CREATE INDEX "stock_transactions_type_idx" ON "stock_transactions"("type");

-- CreateIndex
CREATE INDEX "stock_transactions_date_idx" ON "stock_transactions"("date");

-- CreateIndex
CREATE INDEX "stocks_ticker_idx" ON "stocks"("ticker");

-- CreateIndex
CREATE INDEX "stocks_sector_idx" ON "stocks"("sector");

-- CreateIndex
CREATE INDEX "stocks_assetType_idx" ON "stocks"("assetType");

-- CreateIndex
CREATE INDEX "stocks_isActive_idx" ON "stocks"("isActive");

-- CreateIndex
CREATE INDEX "watchlists_userId_idx" ON "watchlists"("userId");

-- CreateIndex
CREATE INDEX "watchlists_stockId_idx" ON "watchlists"("stockId");

-- CreateIndex
CREATE INDEX "watchlists_isActive_idx" ON "watchlists"("isActive");

-- AddForeignKey
ALTER TABLE "cashflow_group_templates" ADD CONSTRAINT "cashflow_group_templates_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cashflow_group_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_groups" ADD CONSTRAINT "cashflow_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_groups" ADD CONSTRAINT "cashflow_groups_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "cashflow_group_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_groups" ADD CONSTRAINT "cashflow_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cashflow_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_items" ADD CONSTRAINT "cashflow_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_items" ADD CONSTRAINT "cashflow_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "cashflow_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_values" ADD CONSTRAINT "cashflow_values_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_values" ADD CONSTRAINT "cashflow_values_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "cashflow_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_data" ADD CONSTRAINT "dashboard_data_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
