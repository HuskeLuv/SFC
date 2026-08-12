-- CreateTable
CREATE TABLE "dividas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instituicao" TEXT,
    "tipo" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "principal" DECIMAL(15,2),
    "taxaAm" DECIMAL(8,6),
    "taxaUnidadeEntrada" TEXT NOT NULL DEFAULT 'am',
    "prazoMeses" INTEGER,
    "sistema" TEXT,
    "indexador" TEXT NOT NULL DEFAULT 'PREFIXADO',
    "primeiroVencimento" TEXT,
    "saldoInicial" DECIMAL(15,2),
    "dataSaldoInicial" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dividas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divida_pagamentos" (
    "id" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "parcelaNumero" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT 'pagamento',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divida_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dividas_userId_idx" ON "dividas"("userId");

-- CreateIndex
CREATE INDEX "dividas_userId_status_idx" ON "dividas"("userId", "status");

-- CreateIndex
CREATE INDEX "divida_pagamentos_dividaId_idx" ON "divida_pagamentos"("dividaId");

-- CreateIndex
CREATE INDEX "divida_pagamentos_dividaId_month_idx" ON "divida_pagamentos"("dividaId", "month");

-- AddForeignKey
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divida_pagamentos" ADD CONSTRAINT "divida_pagamentos_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
