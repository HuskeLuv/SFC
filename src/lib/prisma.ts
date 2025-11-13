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

if (
  process.env.NODE_ENV !== 'production' &&
  (!globalForPrisma.prisma || typeof (globalForPrisma.prisma as any).consultantInvite === 'undefined')
) {
  globalForPrisma.prisma = createPrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export default prisma; 