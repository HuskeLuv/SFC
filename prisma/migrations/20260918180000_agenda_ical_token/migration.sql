-- Feed iCal da Agenda: token revogável por usuário.
ALTER TABLE "agenda_preferencias" ADD COLUMN IF NOT EXISTS "icalToken" TEXT;
ALTER TABLE "agenda_preferencias" ADD COLUMN IF NOT EXISTS "icalCriadoEm" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_preferencias_icalToken_key" ON "agenda_preferencias"("icalToken");
