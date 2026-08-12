import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  economicIndex: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
// Cache TTL vira passthrough: cada teste bate no "banco" mockado.
vi.mock('@/lib/simpleTtlCache', () => ({
  getTtlCache: () => ({ get: () => undefined, set: () => {} }),
  deleteTtlCacheKeyPrefix: () => {},
}));

import { accruedIndexFactor } from '../indexacaoDivida';

describe('accruedIndexFactor', () => {
  beforeEach(() => {
    mockPrisma.economicIndex.findMany.mockReset();
  });

  it('PREFIXADO → 1 sem consultar o banco', async () => {
    const factor = await accruedIndexFactor('PREFIXADO', '2025-01');
    expect(factor).toBe(1);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('indexador desconhecido ou mês ausente → 1', async () => {
    expect(await accruedIndexFactor('IGPM', '2025-01')).toBe(1);
    expect(await accruedIndexFactor('CDI', null)).toBe(1);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('mês inicial no futuro → 1', async () => {
    const factor = await accruedIndexFactor('CDI', '2030-01', new Date('2026-08-12'));
    expect(factor).toBe(1);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('CDI diário: compõe Π(1 + taxa) sobre as linhas', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { value: 0.0005 },
      { value: 0.0005 },
      { value: 0.0005 },
    ]);
    const factor = await accruedIndexFactor('CDI', '2026-01', new Date('2026-02-01'));
    expect(factor).toBeCloseTo(Math.pow(1.0005, 3), 10);
    expect(mockPrisma.economicIndex.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ indexType: 'CDI' }),
      }),
    );
  });

  it('IPCA mensal: compõe as variações do intervalo', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 0.005 }, { value: 0.004 }]);
    const factor = await accruedIndexFactor('IPCA', '2026-01', new Date('2026-03-15'));
    expect(factor).toBeCloseTo(1.005 * 1.004, 10);
  });

  it('série vazia → 1 (degrada sem corrigir)', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    expect(await accruedIndexFactor('TR', '2026-01', new Date('2026-06-01'))).toBe(1);
  });

  it('valores não-numéricos são ignorados', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 'x' }, { value: 0.01 }]);
    const factor = await accruedIndexFactor('CDI', '2026-01', new Date('2026-06-01'));
    expect(factor).toBeCloseTo(1.01, 10);
  });

  it('tabela ausente (P2021) → 1', async () => {
    mockPrisma.economicIndex.findMany.mockRejectedValue({ code: 'P2021' });
    expect(await accruedIndexFactor('CDI', '2026-01', new Date('2026-06-01'))).toBe(1);
  });
});
