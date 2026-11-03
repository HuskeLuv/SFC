-- Push de proventos recebidos (ticket 86e3yeay4): categoria 'proventos' nas preferências de push.
-- Migration ADITIVA e idempotente: só ADD COLUMN IF NOT EXISTS com DEFAULT (sem registro = ligado).
ALTER TABLE "push_preferencias" ADD COLUMN IF NOT EXISTS "proventos" BOOLEAN NOT NULL DEFAULT true;
