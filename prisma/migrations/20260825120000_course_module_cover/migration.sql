-- Área Educacional: módulos viram cards na trilha (capa 16:9 + descrição),
-- layout de referência do Pedro (ticket 25/08/2026).
ALTER TABLE "course_modules" ADD COLUMN "description" TEXT;
ALTER TABLE "course_modules" ADD COLUMN "coverUrl" TEXT;
