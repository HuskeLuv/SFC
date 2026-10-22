import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    secCompany: { findUnique: vi.fn() },
    assetFundamentalsPeriod: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock }));

import { lerPeriodosSec } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';

describe('lerPeriodosSec: 10-K do cikHistorico (XOM)', () => {
  beforeEach(() => {
    prismaMock.secCompany.findUnique.mockReset();
    prismaMock.assetFundamentalsPeriod.findMany.mockReset().mockResolvedValue([]);
  });

  it('holding nova sem 10-K lê os FY do CIK antigo', async () => {
    prismaMock.secCompany.findUnique.mockResolvedValue({ cikHistorico: '0000034088' });
    await lerPeriodosSec('CIK:0002115436');
    expect(prismaMock.secCompany.findUnique).toHaveBeenCalledWith({
      where: { cik: '0002115436' },
      select: { cikHistorico: true },
    });
    expect(prismaMock.assetFundamentalsPeriod.findMany.mock.calls[0][0].where.emissorId).toBe(
      'CIK:0000034088',
    );
  });

  it('sem cikHistorico lê o próprio CIK', async () => {
    prismaMock.secCompany.findUnique.mockResolvedValue({ cikHistorico: null });
    await lerPeriodosSec('CIK:0000320193');
    expect(prismaMock.assetFundamentalsPeriod.findMany.mock.calls[0][0].where.emissorId).toBe(
      'CIK:0000320193',
    );
  });
});
