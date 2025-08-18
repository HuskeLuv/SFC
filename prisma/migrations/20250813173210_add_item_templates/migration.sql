-- AlterTable
ALTER TABLE "cashflow_items" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "stock_transactions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "cashflow_item_templates" (
    "id" TEXT NOT NULL,
    "groupTemplateId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "significado" TEXT,
    "rank" INTEGER,
    "percentTotal" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "categoria" TEXT,
    "formaPagamento" "PaymentMethod",
    "isInvestment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cashflow_item_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashflow_item_templates_groupTemplateId_idx" ON "cashflow_item_templates"("groupTemplateId");

-- CreateIndex
CREATE INDEX "cashflow_item_templates_isActive_idx" ON "cashflow_item_templates"("isActive");

-- CreateIndex
CREATE INDEX "cashflow_item_templates_isInvestment_idx" ON "cashflow_item_templates"("isInvestment");

-- AddForeignKey
ALTER TABLE "cashflow_item_templates" ADD CONSTRAINT "cashflow_item_templates_groupTemplateId_fkey" FOREIGN KEY ("groupTemplateId") REFERENCES "cashflow_group_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_items" ADD CONSTRAINT "cashflow_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "cashflow_item_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
