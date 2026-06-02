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
CREATE UNIQUE INDEX "aposentadoria_planos_userId_key" ON "aposentadoria_planos"("userId");

-- CreateIndex
CREATE INDEX "aposentadoria_plano_entries_planoId_idx" ON "aposentadoria_plano_entries"("planoId");

-- CreateIndex
CREATE UNIQUE INDEX "aposentadoria_plano_entries_planoId_off_key" ON "aposentadoria_plano_entries"("planoId", "off");

-- AddForeignKey
ALTER TABLE "aposentadoria_planos" ADD CONSTRAINT "aposentadoria_planos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aposentadoria_plano_entries" ADD CONSTRAINT "aposentadoria_plano_entries_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "aposentadoria_planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
