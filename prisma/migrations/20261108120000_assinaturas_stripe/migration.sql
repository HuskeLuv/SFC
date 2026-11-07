-- Assinaturas no Stripe (ClickUp 86e2zkhe2, 08/11/2026). Fica inerte com ASSINATURAS_HABILITADAS
-- desligada: nenhum código lê estas tabelas sem a chave.
-- Migration ADITIVA e idempotente: só tabelas novas, nada existente muda e nenhum backfill.

-- Uma linha por usuário: espelho da assinatura do Stripe + cortesia manual (equipe/QA).
CREATE TABLE IF NOT EXISTS "assinaturas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "plano" TEXT NOT NULL DEFAULT 'basic',
    "intervalo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'none',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEnd" TIMESTAMP(3),
    "carenciaAte" TIMESTAMP(3),
    "primeiraCobrancaEm" TIMESTAMP(3),
    "cortesiaPlano" TEXT,
    "cortesiaAte" TIMESTAMP(3),
    "cortesiaMotivo" TEXT,
    "ultimoEventoStripeEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinaturas_plano_check" CHECK ("plano" IN ('basic', 'pro', 'adv')),
    CONSTRAINT "assinaturas_cortesiaPlano_check" CHECK ("cortesiaPlano" IN ('pro', 'adv'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "assinaturas_userId_key" ON "assinaturas"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "assinaturas_stripeCustomerId_key" ON "assinaturas"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "assinaturas_stripeSubscriptionId_key" ON "assinaturas"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "assinaturas_status_idx" ON "assinaturas"("status");
CREATE INDEX IF NOT EXISTS "assinaturas_cortesiaAte_idx" ON "assinaturas"("cortesiaAte");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_userId_fkey') THEN
    ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Idempotência do webhook do Stripe (id = evt_…).
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'recebido',
    "error" TEXT,
    "userId" TEXT,
    "valorCentavos" INTEGER,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stripe_webhook_events_type_receivedAt_idx" ON "stripe_webhook_events"("type", "receivedAt");

-- Pedidos de desistência em 7 dias (Decreto 7.962, art. 5º); o suporte atende no Dashboard.
CREATE TABLE IF NOT EXISTS "assinatura_pedidos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'arrependimento',
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidoEm" TIMESTAMP(3),
    CONSTRAINT "assinatura_pedidos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assinatura_pedidos_status_createdAt_idx" ON "assinatura_pedidos"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "assinatura_pedidos_userId_idx" ON "assinatura_pedidos"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinatura_pedidos_userId_fkey') THEN
    ALTER TABLE "assinatura_pedidos" ADD CONSTRAINT "assinatura_pedidos_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
