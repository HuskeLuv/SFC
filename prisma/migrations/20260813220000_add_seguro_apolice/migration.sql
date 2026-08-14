-- CreateTable
CREATE TABLE "seguro_apolices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cobertura" TEXT NOT NULL,
    "risco" TEXT NOT NULL,
    "custoAnual" DECIMAL(15,2) NOT NULL,
    "capitalSegurado" DECIMAL(15,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seguro_apolices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seguro_apolices_userId_idx" ON "seguro_apolices"("userId");

-- AddForeignKey
ALTER TABLE "seguro_apolices" ADD CONSTRAINT "seguro_apolices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
