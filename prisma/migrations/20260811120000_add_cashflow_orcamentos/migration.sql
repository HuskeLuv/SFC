-- CreateTable
CREATE TABLE "cashflow_orcamentos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'grupo',
    "year" INTEGER NOT NULL,
    "tipoMeta" TEXT NOT NULL DEFAULT 'valor',
    "valor" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashflow_orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashflow_orcamentos_userId_year_tipo_groupId_key" ON "cashflow_orcamentos"("userId", "year", "tipo", "groupId");

-- CreateIndex
CREATE INDEX "cashflow_orcamentos_userId_year_idx" ON "cashflow_orcamentos"("userId", "year");

-- Unicidade da linha especial (groupId NULL): Postgres trata NULLs como
-- distintos na unique composta acima, então garantimos por índice parcial
-- que só exista UMA meta sem grupo por (usuário, ano, tipo).
CREATE UNIQUE INDEX "cashflow_orcamentos_userId_year_tipo_nullgroup_key" ON "cashflow_orcamentos"("userId", "year", "tipo") WHERE "groupId" IS NULL;

-- AddForeignKey
ALTER TABLE "cashflow_orcamentos" ADD CONSTRAINT "cashflow_orcamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashflow_orcamentos" ADD CONSTRAINT "cashflow_orcamentos_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CashflowGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
