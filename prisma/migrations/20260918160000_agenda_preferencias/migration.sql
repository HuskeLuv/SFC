-- Preferências da Agenda (por enquanto só o liga/desliga dos lembretes).
CREATE TABLE IF NOT EXISTS "agenda_preferencias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lembretes" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agenda_preferencias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agenda_preferencias_userId_key" ON "agenda_preferencias"("userId");

ALTER TABLE "agenda_preferencias"
    ADD CONSTRAINT "agenda_preferencias_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
