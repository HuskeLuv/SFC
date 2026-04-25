-- Migration retroativa: a tabela consultant_impersonation_logs foi criada via
-- `prisma db push` em algum momento e a migration de CREATE original nunca foi
-- commitada. A migration 20260328120000_add_impersonation_session_token assume
-- que a tabela já existe (faz ALTER TABLE), o que quebra qualquer `migrate dev`
-- novo (shadow DB falha em P1014). Este arquivo restaura a história.
--
-- Estado: BEFORE 20260328120000 — sem sessionToken e sem o índice respectivo.

-- CreateTable
CREATE TABLE "consultant_impersonation_logs" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_impersonation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_consultantId_idx" ON "consultant_impersonation_logs"("consultantId");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_clientId_idx" ON "consultant_impersonation_logs"("clientId");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_createdAt_idx" ON "consultant_impersonation_logs"("createdAt");

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_action_idx" ON "consultant_impersonation_logs"("action");

-- AddForeignKey
ALTER TABLE "consultant_impersonation_logs" ADD CONSTRAINT "consultant_impersonation_logs_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_impersonation_logs" ADD CONSTRAINT "consultant_impersonation_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
