-- Create enum for consultant invitations when it does not exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ConsultantInviteStatus'
  ) THEN
    CREATE TYPE "ConsultantInviteStatus" AS ENUM ('pending', 'accepted', 'rejected');
  END IF;
END $$;

-- Ensure optional asset relation exists on watchlists
ALTER TABLE "watchlists"
ADD COLUMN IF NOT EXISTS "assetId" TEXT;

ALTER TABLE "watchlists"
ALTER COLUMN "stockId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'watchlists_assetId_fkey'
  ) THEN
    ALTER TABLE "watchlists"
    ADD CONSTRAINT "watchlists_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Create consultant invitations table
CREATE TABLE IF NOT EXISTS "ConsultantInvite" (
  "id" TEXT NOT NULL,
  "consultantId" TEXT NOT NULL,
  "invitedUserId" TEXT,
  "email" TEXT NOT NULL,
  "status" "ConsultantInviteStatus" NOT NULL DEFAULT 'pending',
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "ConsultantInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConsultantInvite_token_key"
ON "ConsultantInvite" ("token");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ConsultantInvite_consultantId_fkey'
  ) THEN
    ALTER TABLE "ConsultantInvite"
    ADD CONSTRAINT "ConsultantInvite_consultantId_fkey"
    FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ConsultantInvite_invitedUserId_fkey'
  ) THEN
    ALTER TABLE "ConsultantInvite"
    ADD CONSTRAINT "ConsultantInvite_invitedUserId_fkey"
    FOREIGN KEY ("invitedUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inviteId" TEXT,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
ON "Notification" ("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Notification_userId_fkey'
  ) THEN
    ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Notification_inviteId_fkey'
  ) THEN
    ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES "ConsultantInvite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

