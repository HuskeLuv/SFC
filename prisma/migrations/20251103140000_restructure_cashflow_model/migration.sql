-- Migration: Restructure Cashflow Model
-- Date: 2025-11-03
-- Description: Reestrutura modelo de Cashflow para suportar templates padrão e hierarquia escalável

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema
    AND table_name = 'User'
  ) THEN
    CREATE TABLE "User" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "avatarUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema
    AND table_name = 'CashflowGroup'
  ) THEN
    CREATE TABLE "CashflowGroup" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'Despesas',
      "parentId" TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "CashflowGroup_pkey" PRIMARY KEY ("id")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema
    AND table_name = 'CashflowItem'
  ) THEN
    CREATE TABLE "CashflowItem" (
      "id" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "descricao" TEXT NOT NULL,
      "significado" TEXT,
      "rank" INTEGER,
      "order" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "CashflowItem_pkey" PRIMARY KEY ("id")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema
    AND table_name = 'CashflowValue'
  ) THEN
    CREATE TABLE "CashflowValue" (
      "id" TEXT NOT NULL,
      "itemId" TEXT NOT NULL,
      "mes" INTEGER NOT NULL,
      "valor" DOUBLE PRECISION NOT NULL,
      CONSTRAINT "CashflowValue_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

-- ============================================================================
-- STEP 1: Adicionar novos campos necessários
-- ============================================================================
-- CashflowGroup: Adicionar orderIndex (se não existir), createdAt, updatedAt
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowGroup' AND column_name = 'orderIndex') THEN
    ALTER TABLE "CashflowGroup" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowGroup' AND column_name = 'createdAt') THEN
    ALTER TABLE "CashflowGroup" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowGroup' AND column_name = 'updatedAt') THEN
    ALTER TABLE "CashflowGroup" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Migrar dados: copiar order para orderIndex
UPDATE "CashflowGroup" SET "orderIndex" = "order" WHERE "orderIndex" = 0 AND "order" IS NOT NULL;

-- CashflowGroup: Tornar userId opcional
ALTER TABLE "CashflowGroup" ALTER COLUMN "userId" DROP NOT NULL;

-- CashflowGroup: Atualizar tipo para formato novo (entrada, despesa, investimento)
UPDATE "CashflowGroup" SET "type" = 'entrada' WHERE "type" = 'Entradas';
UPDATE "CashflowGroup" SET "type" = 'despesa' WHERE "type" = 'Despesas';
UPDATE "CashflowGroup" SET "type" = 'investimento' WHERE "type" = 'Investimentos';

-- CashflowGroup: Remover coluna antiga "order" após migração
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CashflowGroup' AND column_name = 'order'
  ) THEN
    ALTER TABLE "CashflowGroup" DROP COLUMN "order";
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Atualizar CashflowItem
-- ============================================================================

-- Renomear descricao para name
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowItem' AND column_name = 'descricao') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowItem' AND column_name = 'name') THEN
      ALTER TABLE "CashflowItem" RENAME COLUMN "descricao" TO "name";
    ELSE
      -- Se ambos existem, migrar dados e depois remover descricao
      UPDATE "CashflowItem" SET "name" = "descricao" WHERE "name" IS NULL OR "name" = '';
      ALTER TABLE "CashflowItem" DROP COLUMN "descricao";
    END IF;
  END IF;
END $$;

-- Adicionar userId opcional
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowItem' AND column_name = 'userId') THEN
    ALTER TABLE "CashflowItem" ADD COLUMN "userId" TEXT;
    -- Criar foreign key depois
  END IF;
END $$;

-- Adicionar createdAt e updatedAt
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowItem' AND column_name = 'createdAt') THEN
    ALTER TABLE "CashflowItem" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowItem' AND column_name = 'updatedAt') THEN
    ALTER TABLE "CashflowItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Migrar userId dos grupos para itens (se item pertence a grupo de um usuário)
UPDATE "CashflowItem" ci
SET "userId" = cg."userId"
FROM "CashflowGroup" cg
WHERE ci."groupId" = cg.id AND ci."userId" IS NULL;

-- CashflowItem: Remover coluna antiga "order" após migração
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CashflowItem' AND column_name = 'order'
  ) THEN
    ALTER TABLE "CashflowItem" DROP COLUMN "order";
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Atualizar CashflowValue
-- ============================================================================

-- Adicionar userId (obrigatório) se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'userId') THEN
    ALTER TABLE "CashflowValue" ADD COLUMN "userId" TEXT;
    -- Migrar userId do item
    UPDATE "CashflowValue" cv
    SET "userId" = ci."userId"
    FROM "CashflowItem" ci
    WHERE cv."itemId" = ci.id AND cv."userId" IS NULL;
    
    -- Tornar obrigatório
    ALTER TABLE "CashflowValue" ALTER COLUMN "userId" SET NOT NULL;
  END IF;
END $$;

-- Adicionar coluna color (opcional) se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CashflowValue' AND column_name = 'color'
  ) THEN
    ALTER TABLE "CashflowValue" ADD COLUMN "color" TEXT;
  END IF;
END $$;

-- Adicionar year
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'year') THEN
    ALTER TABLE "CashflowValue" ADD COLUMN "year" INTEGER;
    -- Usar ano atual como padrão
    UPDATE "CashflowValue" SET "year" = EXTRACT(YEAR FROM CURRENT_DATE) WHERE "year" IS NULL;
    ALTER TABLE "CashflowValue" ALTER COLUMN "year" SET NOT NULL;
  END IF;
END $$;

-- Renomear mes para month
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'mes') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'month') THEN
      ALTER TABLE "CashflowValue" RENAME COLUMN "mes" TO "month";
    END IF;
  END IF;
END $$;

-- Renomear valor para value
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'valor') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'value') THEN
      ALTER TABLE "CashflowValue" RENAME COLUMN "valor" TO "value";
    END IF;
  END IF;
END $$;

-- Adicionar createdAt e updatedAt
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'createdAt') THEN
    ALTER TABLE "CashflowValue" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CashflowValue' AND column_name = 'updatedAt') THEN
    ALTER TABLE "CashflowValue" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Criar índices e constraints
-- ============================================================================

-- Índices para CashflowGroup
CREATE INDEX IF NOT EXISTS "CashflowGroup_userId_idx" ON "CashflowGroup"("userId");
CREATE INDEX IF NOT EXISTS "CashflowGroup_parentId_idx" ON "CashflowGroup"("parentId");

-- Índices para CashflowItem
CREATE INDEX IF NOT EXISTS "CashflowItem_groupId_idx" ON "CashflowItem"("groupId");
CREATE INDEX IF NOT EXISTS "CashflowItem_userId_idx" ON "CashflowItem"("userId");

-- Índices para CashflowValue
CREATE INDEX IF NOT EXISTS "CashflowValue_itemId_idx" ON "CashflowValue"("itemId");
CREATE INDEX IF NOT EXISTS "CashflowValue_userId_idx" ON "CashflowValue"("userId");

-- Unique constraint para CashflowValue
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'CashflowValue_itemId_userId_year_month_key'
  ) THEN
    ALTER TABLE "CashflowValue" 
    ADD CONSTRAINT "CashflowValue_itemId_userId_year_month_key" 
    UNIQUE ("itemId", "userId", "year", "month");
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Atualizar foreign keys
-- ============================================================================

-- Adicionar foreign key para CashflowItem.userId se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'CashflowItem_userId_fkey'
  ) THEN
    ALTER TABLE "CashflowItem" 
    ADD CONSTRAINT "CashflowItem_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Adicionar foreign key para CashflowValue.userId se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'CashflowValue_userId_fkey'
  ) THEN
    ALTER TABLE "CashflowValue" 
    ADD CONSTRAINT "CashflowValue_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

