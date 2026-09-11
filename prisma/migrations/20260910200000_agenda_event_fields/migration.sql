-- Agenda (set/2026): Event ganha descrição, fim, hora, categoria, recorrência,
-- lembrete e carimbos; índice por (userId, date); cascade ao apagar o usuário.
ALTER TABLE "Event"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "hora" TEXT,
  ADD COLUMN "categoria" TEXT NOT NULL DEFAULT 'pessoal',
  ADD COLUMN "recorrencia" TEXT NOT NULL DEFAULT 'nenhuma',
  ADD COLUMN "lembrete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Event_userId_date_idx" ON "Event"("userId", "date");

ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_userId_fkey";
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
