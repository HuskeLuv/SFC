-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'consultant', 'admin');

-- CreateEnum
CREATE TYPE "ConsultantClientStatus" AS ENUM ('active', 'inactive');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientConsultant" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ConsultantClientStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "ClientConsultant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientConsultant_consultantId_clientId_key" ON "ClientConsultant"("consultantId", "clientId");

-- CreateIndex
CREATE INDEX "ClientConsultant_clientId_idx" ON "ClientConsultant"("clientId");

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

