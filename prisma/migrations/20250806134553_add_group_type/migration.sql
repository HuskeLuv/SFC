/*
  Warnings:

  - Added the required column `type` to the `CashflowGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CashflowGroup" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Despesas';

-- Update existing records based on their names
UPDATE "CashflowGroup" SET "type" = 'Entradas' WHERE "name" LIKE '%Entradas%' OR "name" LIKE '%Receitas%';
UPDATE "CashflowGroup" SET "type" = 'Despesas' WHERE "name" LIKE '%Despesas%' OR "name" LIKE '%Gastos%' OR "name" LIKE '%Saídas%';
