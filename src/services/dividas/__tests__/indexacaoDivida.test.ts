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

import { accruedIndexFactor, monthlyIndexFactors } from '../indexacaoDivida';

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
    expect(await accruedIndexFactor('SELIC_META', '2025-01')).toBe(1);
    expect(await accruedIndexFactor('CDI', null)).toBe(1);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('IGPM mensal: compõe as variações do intervalo (série 189)', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([{ value: 0.006 }, { value: -0.002 }]);
    const factor = await accruedIndexFactor('IGPM', '2026-01', new Date('2026-03-15'));
    expect(factor).toBeCloseTo(1.006 * 0.998, 10);
    expect(mockPrisma.economicIndex.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ indexType: 'IGPM' }),
      }),
    );
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

  it('TR: amostra só a PRIMEIRA observação de cada mês (taxa de período publicada diariamente)', async () => {
    // 3 dias de jan + 2 de fev — deve compor apenas 1 valor por mês.
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-01-01T00:00:00Z'), value: 0.0017 },
      { date: new Date('2026-01-02T00:00:00Z'), value: 0.0018 },
      { date: new Date('2026-01-03T00:00:00Z'), value: 0.0019 },
      { date: new Date('2026-02-01T00:00:00Z'), value: 0.0016 },
      { date: new Date('2026-02-02T00:00:00Z'), value: 0.0015 },
    ]);
    const factor = await accruedIndexFactor('TR', '2026-01', new Date('2026-03-01'));
    expect(factor).toBeCloseTo(1.0017 * 1.0016, 10);
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

describe('monthlyIndexFactors', () => {
  beforeEach(() => {
    mockPrisma.economicIndex.findMany.mockReset();
  });

  it('PREFIXADO ou mês ausente → {} sem consultar o banco', async () => {
    expect(await monthlyIndexFactors('PREFIXADO', '2026-01', '2026-12')).toEqual({});
    expect(await monthlyIndexFactors('IPCA', null, '2026-12')).toEqual({});
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('IPCA: 1ª parcela no valor contratual e cada aniversário compõe mais um mês realizado', async () => {
    // IPCA de jan e fev publicados; asOf em março.
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-01-01T00:00:00Z'), value: 0.005 },
      { date: new Date('2026-02-01T00:00:00Z'), value: 0.004 },
    ]);
    const f = await monthlyIndexFactors('IPCA', '2026-01', '2026-05', new Date('2026-03-15'));
    expect(f['2026-01']).toBe(1); // aniversário 0 — valor contratual
    expect(f['2026-02']).toBeCloseTo(1.005, 10); // corrigida pelo IPCA de jan
    expect(f['2026-03']).toBeCloseTo(1.005 * 1.004, 10); // jan + fev
    // Meses sem índice publicado repetem o último fator (sem projeção).
    expect(f['2026-04']).toBeCloseTo(1.005 * 1.004, 10);
    expect(f['2026-05']).toBeCloseTo(1.005 * 1.004, 10);
  });

  it('CDI diário: compõe as observações dentro de cada mês', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-01-02T00:00:00Z'), value: 0.0005 },
      { date: new Date('2026-01-05T00:00:00Z'), value: 0.0005 },
      { date: new Date('2026-02-03T00:00:00Z'), value: 0.0004 },
    ]);
    const f = await monthlyIndexFactors('CDI', '2026-01', '2026-03', new Date('2026-03-01'));
    expect(f['2026-01']).toBe(1);
    expect(f['2026-02']).toBeCloseTo(1.0005 * 1.0005, 10);
    expect(f['2026-03']).toBeCloseTo(1.0005 * 1.0005 * 1.0004, 10);
  });

  it('TR: amostra a primeira observação de cada mês', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-01-01T00:00:00Z'), value: 0.0017 },
      { date: new Date('2026-01-02T00:00:00Z'), value: 0.0018 },
      { date: new Date('2026-02-01T00:00:00Z'), value: 0.0016 },
    ]);
    const f = await monthlyIndexFactors('TR', '2026-01', '2026-03', new Date('2026-03-01'));
    expect(f['2026-02']).toBeCloseTo(1.0017, 10);
    expect(f['2026-03']).toBeCloseTo(1.0017 * 1.0016, 10);
  });

  it('IGPM com deflação: fator cai abaixo de 1', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-01-01T00:00:00Z'), value: -0.003 },
    ]);
    const f = await monthlyIndexFactors('IGPM', '2026-01', '2026-02', new Date('2026-02-15'));
    expect(f['2026-02']).toBeCloseTo(0.997, 10);
  });

  it('série vazia → todos os meses em 1 (degrada sem corrigir)', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([]);
    const f = await monthlyIndexFactors('IPCA', '2026-01', '2026-03', new Date('2026-03-01'));
    expect(f).toEqual({ '2026-01': 1, '2026-02': 1, '2026-03': 1 });
  });

  it('janela toda no futuro → fatores 1 sem consultar o banco', async () => {
    const f = await monthlyIndexFactors('IPCA', '2027-01', '2027-03', new Date('2026-08-01'));
    expect(f).toEqual({ '2027-01': 1, '2027-02': 1, '2027-03': 1 });
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });

  it('virada de ano itera os meses corretamente', async () => {
    mockPrisma.economicIndex.findMany.mockResolvedValue([
      { date: new Date('2026-12-01T00:00:00Z'), value: 0.01 },
    ]);
    const f = await monthlyIndexFactors('IPCA', '2026-12', '2027-02', new Date('2027-01-15'));
    expect(Object.keys(f)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(f['2027-01']).toBeCloseTo(1.01, 10);
  });

  it('tabela ausente (P2021) → fatores 1', async () => {
    mockPrisma.economicIndex.findMany.mockRejectedValue({ code: 'P2021' });
    const f = await monthlyIndexFactors('CDI', '2026-01', '2026-02', new Date('2026-02-15'));
    expect(f).toEqual({ '2026-01': 1, '2026-02': 1 });
  });
});
