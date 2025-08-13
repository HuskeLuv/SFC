-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DashboardData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "forma_pagamento" TEXT NOT NULL,
    "pago" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CashflowGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "significado" TEXT,
    "rank" INTEGER,
    "percentTotal" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CashflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashflowValue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CashflowValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardData" ADD CONSTRAINT "DashboardData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashflow" ADD CONSTRAINT "Cashflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowGroup" ADD CONSTRAINT "CashflowGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CashflowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowItem" ADD CONSTRAINT "CashflowItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CashflowGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashflowValue" ADD CONSTRAINT "CashflowValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CashflowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
