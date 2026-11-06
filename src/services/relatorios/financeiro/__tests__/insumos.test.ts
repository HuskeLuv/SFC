import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  cashflowOrcamentoItem: { findMany: vi.fn() },
  portfolioDailySnapshot: { findMany: vi.fn() },
  portfolioPerformance: { findMany: vi.fn() },
  divida: { findMany: vi.fn() },
}));
const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());
const mockBuildSaudeFinanceira = vi.hoisted(() => vi.fn());
const mockCarregarAportesMensais = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));
vi.mock('@/services/saudeFinanceira/saudeFinanceiraServer', () => ({
  buildSaudeFinanceira: mockBuildSaudeFinanceira,
}));
vi.mock('@/services/planejamento/aportesMensais', () => ({
  carregarAportesMensais: mockCarregarAportesMensais,
  chaveMesAporte: (y: number, m0: number) => y * 12 + m0,
}));

import { carregarInsumos, criarInsumos, limparCacheInsumos } from '../insumos';

const AGORA = new Date('2026-11-06T09:42:00-03:00');

describe('insumos do relatório', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limparCacheInsumos();
    mockGetMergedCashflowGroups.mockResolvedValue([]);
    mockBuildSaudeFinanceira.mockImplementation(async (userId: string) => ({ asOf: userId }));
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([]);
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([]);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue([]);
    mockPrisma.divida.findMany.mockImplementation(async (args: { where: { userId: string } }) => [
      { id: `d-${args.where.userId}` },
    ]);
    mockCarregarAportesMensais.mockResolvedValue(new Map());
  });

  it('nada é lido até um montador pedir (bloco bloqueado não roda o insumo)', () => {
    criarInsumos('cli-A', AGORA);
    expect(mockGetMergedCashflowGroups).not.toHaveBeenCalled();
    expect(mockBuildSaudeFinanceira).not.toHaveBeenCalled();
    expect(mockPrisma.divida.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioDailySnapshot.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioPerformance.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowOrcamentoItem.findMany).not.toHaveBeenCalled();
    expect(mockCarregarAportesMensais).not.toHaveBeenCalled();
  });

  it('janela de 13 meses em SP', () => {
    const i = criarInsumos('cli-A', AGORA);
    expect(i.hojeSP).toEqual({ ano: 2026, mes0: 10, dia: 6 });
    expect(i.janela[0]).toBe('2025-11');
    expect(i.janela).toHaveLength(13);
    expect(i.inicioJanela.toISOString()).toBe('2025-11-01T00:00:00.000Z');
  });

  it('cache por targetUserId: dois clientes do mesmo consultor não se cruzam', async () => {
    const a = carregarInsumos('cli-A', AGORA);
    const b = carregarInsumos('cli-B', AGORA);
    expect(a).not.toBe(b);
    expect(await a.dividasComPagamentos()).toEqual([{ id: 'd-cli-A' }]);
    expect(await b.dividasComPagamentos()).toEqual([{ id: 'd-cli-B' }]);
    expect((await a.saudeBase()).asOf).toBe('cli-A');
    expect((await b.saudeBase()).asOf).toBe('cli-B');
    expect(mockBuildSaudeFinanceira).toHaveBeenCalledWith('cli-A');
    expect(mockBuildSaudeFinanceira).toHaveBeenCalledWith('cli-B');
  });

  it('mesma pessoa de novo (outro período) usa o cache e não recarrega', async () => {
    const a1 = carregarInsumos('cli-A', AGORA);
    await a1.saudeBase();
    await a1.cashflowDoAno(2026);
    const a2 = carregarInsumos('cli-A', new Date(AGORA.getTime() + 5_000));
    expect(a2).toBe(a1);
    await a2.saudeBase();
    await a2.cashflowDoAno(2026);
    expect(mockBuildSaudeFinanceira).toHaveBeenCalledTimes(1);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(1);
  });

  it('o cache vence em 60 s', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(AGORA);
      const a1 = carregarInsumos('cli-A', AGORA);
      vi.setSystemTime(new Date(AGORA.getTime() + 61_000));
      const a2 = carregarInsumos('cli-A', new Date());
      expect(a2).not.toBe(a1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('árvore do fluxo memorizada por ano', async () => {
    const i = criarInsumos('cli-A', AGORA);
    await Promise.all([i.cashflowDoAno(2026), i.cashflowDoAno(2026), i.cashflowDoAno(2025)]);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(2);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('cli-A', 2026);
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('cli-A', 2025);
  });

  it('falha não fica presa no memo', async () => {
    mockBuildSaudeFinanceira.mockRejectedValueOnce(new Error('falhou'));
    const i = criarInsumos('cli-A', AGORA);
    await expect(i.saudeBase()).rejects.toThrow('falhou');
    expect((await i.saudeBase()).asOf).toBe('cli-A');
    expect(mockBuildSaudeFinanceira).toHaveBeenCalledTimes(2);
  });

  it('orçados dos anos tocados, Decimal → number', async () => {
    mockPrisma.cashflowOrcamentoItem.findMany.mockResolvedValue([
      { itemId: 'i1', ano: 2026, mes: 10, valor: { toString: () => '150.5' }, pct: null },
    ]);
    const i = criarInsumos('cli-A', AGORA);
    expect(await i.orcadosDosAnos()).toEqual([
      { itemId: 'i1', ano: 2026, mes: 10, valor: 150.5, pct: null },
    ]);
    expect(mockPrisma.cashflowOrcamentoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'cli-A', ano: { in: [2025, 2026] } } }),
    );
  });

  it('snapshots e performance da janela, em número', async () => {
    const d = new Date('2026-10-30T00:00:00Z');
    mockPrisma.portfolioDailySnapshot.findMany.mockResolvedValue([
      { date: d, totalValue: '1000.5', totalInvested: '900' },
    ]);
    mockPrisma.portfolioPerformance.findMany.mockResolvedValue([
      { date: d, dailyReturn: null, cumulativeReturn: '12.5' },
    ]);
    const i = criarInsumos('cli-A', AGORA);
    expect(await i.snapshots13m()).toEqual([{ date: d, totalValue: 1000.5, totalInvested: 900 }]);
    expect(await i.performance13m()).toEqual([
      { date: d, dailyReturn: null, cumulativeReturn: 12.5 },
    ]);
    const where = mockPrisma.portfolioDailySnapshot.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('cli-A');
    expect(where.date.gte.toISOString()).toBe('2025-11-01T00:00:00.000Z');
  });

  it('aportes mensais: os 13 meses, 0 sem transação', async () => {
    mockCarregarAportesMensais.mockResolvedValue(
      new Map([
        [2026 * 12 + 10, 3500.456],
        [2025 * 12 + 10, -200],
      ]),
    );
    const i = criarInsumos('cli-A', AGORA);
    const ap = await i.aportesMensais13m();
    expect(ap).toHaveLength(13);
    expect(ap[0]).toEqual({ mes: '2025-11', valor: -200 });
    expect(ap[1]).toEqual({ mes: '2025-12', valor: 0 });
    expect(ap[12]).toEqual({ mes: '2026-11', valor: 3500.46 });
    expect(mockCarregarAportesMensais).toHaveBeenCalledWith('cli-A', i.inicioJanela, AGORA);
  });
});
