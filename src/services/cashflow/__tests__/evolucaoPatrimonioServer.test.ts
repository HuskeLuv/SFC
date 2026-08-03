import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  cashflowValue: { aggregate: vi.fn() },
  user: { findMany: vi.fn() },
  cashflowPatrimonioSnapshot: { upsert: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));

const mockGetMergedGroups = vi.hoisted(() => vi.fn());
const mockComputeInvestimentos = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('../getCashflowTree', () => ({ getMergedCashflowGroups: mockGetMergedGroups }));
vi.mock('../investimentosPorMes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../investimentosPorMes')>()),
  computeInvestimentosPorMes: mockComputeInvestimentos,
}));

import { getBaseAplicadaAnterior, recomputeEvolucaoSnapshots } from '../evolucaoPatrimonioServer';

const tx = (overrides: Record<string, unknown>) => ({
  type: 'compra',
  total: 1000,
  fees: 0,
  notes: null,
  assetId: 'asset-br',
  asset: { type: 'stock', currency: 'BRL' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.cashflowValue.aggregate.mockResolvedValue({ _sum: { value: null } });
  mockPrisma.cashflowPatrimonioSnapshot.findMany.mockResolvedValue([]);
  mockPrisma.cashflowPatrimonioSnapshot.update.mockResolvedValue({});
  mockGetMergedGroups.mockResolvedValue([]);
  mockComputeInvestimentos.mockResolvedValue({
    porTipo: {},
    totaisPorMes: Array(12).fill(0),
    planejamentoPorMes: Array(12).fill(0),
    tipos: new Set<string>(),
  });
});

describe('getBaseAplicadaAnterior', () => {
  it('soma compras − vendas (total + fees)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000, fees: 2 }),
      tx({ type: 'venda', total: 300, fees: 1 }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1002 - 301, 2);
  });

  it('converte REIT gravado em USD usando o câmbio de notes.cotacaoMoeda', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({ total: 1000 }),
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.2 }),
        asset: { type: 'reit', currency: 'USD' },
      }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1000 + 1560, 2);
  });

  it('venda de REIT sem câmbio reusa o da compra anterior (ordem cronológica)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx({
        assetId: 'asset-reit',
        total: 300,
        notes: JSON.stringify({ cotacaoMoeda: 5.0 }),
        asset: { type: 'reit', currency: 'USD' },
      }),
      tx({
        assetId: 'asset-reit',
        type: 'venda',
        total: 100,
        asset: { type: 'reit', currency: 'USD' },
      }),
    ]);

    expect(await getBaseAplicadaAnterior('u1', 2026)).toBeCloseTo(1500 - 500, 2);
  });
});

describe('recomputeEvolucaoSnapshots', () => {
  const snap = (overrides: Record<string, unknown>) => ({
    id: 'snap-1',
    userId: 'u1',
    year: 2026,
    month: 6,
    valor: 11112.5,
    ...overrides,
  });

  it('atualiza snapshot travado obsoleto com a cadeia recomputada (aporte retroativo)', async () => {
    // Cenário qa.teste2: CDB de reserva de R$ 25k datado de ago/2025 criado
    // depois do cron travar jul/2026. Sem cashflow lançado, a série do ano é
    // flat na base aplicada (aporte cancela com o fluxo livre negativo).
    mockPrisma.stockTransaction.findMany.mockResolvedValue([tx({ total: 25000 })]);
    const aportes = Array(12).fill(0);
    aportes[0] = aportes[1] = aportes[2] = 1587.5;
    mockComputeInvestimentos.mockResolvedValue({
      porTipo: {},
      totaisPorMes: aportes,
      planejamentoPorMes: Array(12).fill(0),
      tipos: new Set<string>(),
    });
    mockPrisma.cashflowPatrimonioSnapshot.findMany.mockResolvedValue([snap({})]);

    await recomputeEvolucaoSnapshots('u1', new Date(Date.UTC(2025, 7, 13)));

    // Afetados: mês da transação em diante no mesmo ano + anos seguintes.
    expect(mockPrisma.cashflowPatrimonioSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          OR: [{ year: { gt: 2025 } }, { year: 2025, month: { gte: 7 } }],
        },
      }),
    );
    expect(mockPrisma.cashflowPatrimonioSnapshot.update).toHaveBeenCalledWith({
      where: { id: 'snap-1' },
      data: { valor: 25000 },
    });
  });

  it('não escreve quando o valor recomputado é igual ao travado', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([tx({ total: 25000 })]);
    mockPrisma.cashflowPatrimonioSnapshot.findMany.mockResolvedValue([snap({ valor: 25000 })]);

    await recomputeEvolucaoSnapshots('u1', new Date(Date.UTC(2025, 7, 13)));

    expect(mockPrisma.cashflowPatrimonioSnapshot.update).not.toHaveBeenCalled();
  });

  it('sem snapshots afetados, não recomputa a série', async () => {
    await recomputeEvolucaoSnapshots('u1', new Date(Date.UTC(2025, 7, 13)));

    expect(mockGetMergedGroups).not.toHaveBeenCalled();
    expect(mockPrisma.cashflowPatrimonioSnapshot.update).not.toHaveBeenCalled();
  });

  it('recomputa a série uma vez por ano afetado (transação muda a base da virada)', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue([tx({ total: 25000 })]);
    mockPrisma.cashflowPatrimonioSnapshot.findMany.mockResolvedValue([
      snap({ id: 'snap-2026', year: 2026, month: 6 }),
      snap({ id: 'snap-2027', year: 2027, month: 0, valor: 0 }),
    ]);

    await recomputeEvolucaoSnapshots('u1', new Date(Date.UTC(2025, 7, 13)));

    expect(mockGetMergedGroups).toHaveBeenCalledTimes(2);
    expect(mockGetMergedGroups).toHaveBeenCalledWith('u1', 2026);
    expect(mockGetMergedGroups).toHaveBeenCalledWith('u1', 2027);
    expect(mockPrisma.cashflowPatrimonioSnapshot.update).toHaveBeenCalledTimes(2);
  });
});
