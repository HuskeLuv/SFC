-- CreateTable
CREATE TABLE "alocacao_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "minimo" DOUBLE PRECISION NOT NULL,
    "maximo" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alocacao_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alocacao_configs_userId_categoria_key" ON "alocacao_configs"("userId", "categoria");

-- CreateIndex
CREATE INDEX "alocacao_configs_userId_idx" ON "alocacao_configs"("userId");

-- AddForeignKey
ALTER TABLE "alocacao_configs" ADD CONSTRAINT "alocacao_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
