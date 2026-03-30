import { vi } from 'vitest';

/**
 * Reusable Prisma mock factory.
 * Usage: const mockPrisma = vi.hoisted(() => createMockPrisma());
 */
export function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    portfolio: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    asset: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    stockTransaction: { findMany: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
    stock: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    assetPriceHistory: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    assetDividendHistory: { findMany: vi.fn(), upsert: vi.fn() },
    marketIndicatorCache: { findUnique: vi.fn(), upsert: vi.fn() },
    consultantImpersonationLog: { create: vi.fn(), findMany: vi.fn() },
    consultant: { findFirst: vi.fn(), findUnique: vi.fn() },
    clientConsultant: { findFirst: vi.fn(), findMany: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    cashflowGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    cashflowItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    cashflowValue: { findMany: vi.fn(), upsert: vi.fn() },
    fixedIncomeAsset: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  };
}
