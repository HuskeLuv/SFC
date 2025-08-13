-- DropIndex
DROP INDEX "CashflowGroup_userId_idx";

-- AlterTable
ALTER TABLE "CashflowGroup" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "percentTotal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CashflowItem" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "dataVencimento" TIMESTAMP(3),
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isInvestment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "CashflowValue" ADD COLUMN     "dataPagamento" TIMESTAMP(3),
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "status" TEXT;
