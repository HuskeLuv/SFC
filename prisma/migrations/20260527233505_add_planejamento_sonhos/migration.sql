-- F3.1: tabelas pra Planejamento Sonhos (substitui o simulador de aposentadoria)

CREATE TABLE IF NOT EXISTS planejamento_objetivos (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target NUMERIC(15,2) NOT NULL,
  months INTEGER NOT NULL,
  "startDate" TEXT,
  available NUMERIC(15,2) NOT NULL DEFAULT 0,
  rate NUMERIC(8,6) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "planejamento_objetivos_userId_idx"
  ON planejamento_objetivos("userId");
CREATE INDEX IF NOT EXISTS "planejamento_objetivos_userId_category_idx"
  ON planejamento_objetivos("userId", category);

CREATE TABLE IF NOT EXISTS planejamento_objetivo_entries (
  id TEXT PRIMARY KEY,
  "objetivoId" TEXT NOT NULL REFERENCES planejamento_objetivos(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  aporte NUMERIC(15,2) NOT NULL,
  balance NUMERIC(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "planejamento_objetivo_entries_objetivoId_month_key"
  ON planejamento_objetivo_entries("objetivoId", month);
CREATE INDEX IF NOT EXISTS "planejamento_objetivo_entries_objetivoId_idx"
  ON planejamento_objetivo_entries("objetivoId");
