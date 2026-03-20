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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_proventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_proventos_portfolioId_idx" ON "portfolio_proventos"("portfolioId");

-- CreateIndex
CREATE INDEX "portfolio_proventos_userId_idx" ON "portfolio_proventos"("userId");

-- AddForeignKey
ALTER TABLE "portfolio_proventos" ADD CONSTRAINT "portfolio_proventos_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_proventos" ADD CONSTRAINT "portfolio_proventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
