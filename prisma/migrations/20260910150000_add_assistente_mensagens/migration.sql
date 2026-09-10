-- Assistente de IA: métricas/custo por chamada ao modelo (set/2026)
CREATE TABLE "assistente_mensagens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "viaConsultant" BOOLEAN NOT NULL DEFAULT false,
    "intencao" TEXT NOT NULL,
    "motor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "custoBrl" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "stopReason" TEXT NOT NULL DEFAULT 'n/a',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "propostaGerada" BOOLEAN NOT NULL DEFAULT false,
    "propostaConfirmada" BOOLEAN NOT NULL DEFAULT false,
    "textoUsuario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistente_mensagens_userId_createdAt_idx" ON "assistente_mensagens"("userId", "createdAt");
CREATE INDEX "assistente_mensagens_createdAt_idx" ON "assistente_mensagens"("createdAt");

ALTER TABLE "assistente_mensagens" ADD CONSTRAINT "assistente_mensagens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
