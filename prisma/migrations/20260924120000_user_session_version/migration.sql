-- PWA fase 0 (24/09/2026): revogação de sessões. Todo JWT carrega o
-- sessionVersion (claim `sv`) do momento em que foi emitido; incrementar a
-- coluna derruba as sessões antigas ("Sair de todos os dispositivos", troca
-- de senha, 2FA). Aditiva: tokens antigos sem `sv` valem como 0.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
