-- CreateTable
CREATE TABLE "user_change_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "viaConsultant" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_change_logs_userId_createdAt_idx" ON "user_change_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_change_logs_userId_section_createdAt_idx" ON "user_change_logs"("userId", "section", "createdAt");

-- AddForeignKey
ALTER TABLE "user_change_logs" ADD CONSTRAINT "user_change_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
