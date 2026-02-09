import { PrismaClient } from '@prisma/client';

type GlobalPrisma = {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as typeof globalThis & GlobalPrisma;

const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

const hasPortfolioObjetivoField = (client?: PrismaClient) => {
  if (!client) return false;
  const dmmf = (client as any)._dmmf;
  const fields = dmmf?.modelMap?.Portfolio?.fields;
  if (!Array.isArray(fields)) return false;
  return fields.some((field: { name?: string }) => field?.name === "objetivo");
};

if (
  process.env.NODE_ENV !== 'production' &&
  (!globalForPrisma.prisma ||
    typeof (globalForPrisma.prisma as any).consultantInvite === 'undefined' ||
    typeof (globalForPrisma.prisma as any).fixedIncomeAsset === 'undefined' ||
    !hasPortfolioObjetivoField(globalForPrisma.prisma))
) {
  globalForPrisma.prisma = createPrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export default prisma; 