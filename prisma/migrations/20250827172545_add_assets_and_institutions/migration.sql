/*
  Warnings:

  - You are about to drop the column `isActive` on the `portfolios` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `stock_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `assetType` on the `stocks` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `watchlists` table. All the data in the column will be lost.
  - You are about to drop the `cashflow_group_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cashflow_groups` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cashflow_item_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cashflow_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cashflow_values` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `dashboard_data` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `type` on the `stock_transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "cashflow_group_templates" DROP CONSTRAINT "cashflow_group_templates_parentId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_groups" DROP CONSTRAINT "cashflow_groups_parentId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_groups" DROP CONSTRAINT "cashflow_groups_templateId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_groups" DROP CONSTRAINT "cashflow_groups_userId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_item_templates" DROP CONSTRAINT "cashflow_item_templates_groupTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_items" DROP CONSTRAINT "cashflow_items_groupId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_items" DROP CONSTRAINT "cashflow_items_templateId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_items" DROP CONSTRAINT "cashflow_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_values" DROP CONSTRAINT "cashflow_values_itemId_fkey";

-- DropForeignKey
ALTER TABLE "cashflow_values" DROP CONSTRAINT "cashflow_values_userId_fkey";

-- DropForeignKey
ALTER TABLE "dashboard_data" DROP CONSTRAINT "dashboard_data_userId_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_userId_fkey";

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

-- DropIndex
DROP INDEX "portfolios_isActive_idx";

-- DropIndex
DROP INDEX "portfolios_stockId_idx";

-- DropIndex
DROP INDEX "portfolios_userId_idx";

-- DropIndex
DROP INDEX "stock_transactions_date_idx";

-- DropIndex
DROP INDEX "stock_transactions_stockId_idx";

-- DropIndex
DROP INDEX "stock_transactions_type_idx";

-- DropIndex
DROP INDEX "stock_transactions_userId_idx";

-- DropIndex
DROP INDEX "stocks_assetType_idx";

-- DropIndex
DROP INDEX "stocks_isActive_idx";

-- DropIndex
DROP INDEX "stocks_sector_idx";

-- DropIndex
DROP INDEX "stocks_ticker_idx";

-- DropIndex
DROP INDEX "watchlists_isActive_idx";

-- DropIndex
DROP INDEX "watchlists_stockId_idx";

-- DropIndex
DROP INDEX "watchlists_userId_idx";

-- AlterTable
ALTER TABLE "portfolios" DROP COLUMN "isActive";

-- AlterTable
ALTER TABLE "stock_transactions" DROP COLUMN "updatedAt",
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stocks" DROP COLUMN "assetType";

-- AlterTable
ALTER TABLE "watchlists" DROP COLUMN "isActive";

-- DropTable
DROP TABLE "cashflow_group_templates";

-- DropTable
DROP TABLE "cashflow_groups";

-- DropTable
DROP TABLE "cashflow_item_templates";

-- DropTable
DROP TABLE "cashflow_items";

-- DropTable
DROP TABLE "cashflow_values";

-- DropTable
DROP TABLE "dashboard_data";

-- DropTable
DROP TABLE "events";

-- DropTable
DROP TABLE "users";

-- DropEnum
DROP TYPE "AssetType";

-- DropEnum
DROP TYPE "CashflowStatus";

-- DropEnum
DROP TYPE "CashflowType";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "StockTransactionType";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "percentTotal" DOUBLE PRECISION,
    "observacoes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CashflowGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "significado" TEXT,
    "rank" INTEGER,
    "percentTotal" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "categoria" TEXT,
    "formaPagamento" TEXT,
    "status" TEXT,
    "dataVencimento" TIMESTAMP(3),
    "observacoes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isInvestment" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CashflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowValue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "status" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "CashflowValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "setor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "assets_ticker_key" ON "assets"("ticker");

-- CreateIndex
CREATE INDEX "assets_ticker_idx" ON "assets"("ticker");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_codigo_key" ON "institutions"("codigo");

-- CreateIndex
CREATE INDEX "institutions_codigo_idx" ON "institutions"("codigo");

-- CreateIndex
CREATE INDEX "institutions_cnpj_idx" ON "institutions"("cnpj");

-- CreateIndex
CREATE INDEX "institutions_status_idx" ON "institutions"("status");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardData" ADD CONSTRAINT "DashboardData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashflow" ADD CONSTRAINT "Cashflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CashflowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CashflowGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowValue" ADD CONSTRAINT "CashflowValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CashflowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
