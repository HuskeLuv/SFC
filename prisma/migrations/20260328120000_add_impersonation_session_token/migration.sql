-- AlterTable
ALTER TABLE "consultant_impersonation_logs" ADD COLUMN "sessionToken" TEXT;

-- CreateIndex
CREATE INDEX "consultant_impersonation_logs_sessionToken_idx" ON "consultant_impersonation_logs"("sessionToken");

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_sessions_sessionToken_key" ON "impersonation_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "impersonation_sessions_consultantId_idx" ON "impersonation_sessions"("consultantId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_sessionToken_idx" ON "impersonation_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "impersonation_sessions_expiresAt_idx" ON "impersonation_sessions"("expiresAt");
