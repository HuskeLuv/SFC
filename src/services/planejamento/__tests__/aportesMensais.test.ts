import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/cashflow/investimentosPorMes', () => ({
  carregarCambioDasTransacoes: vi.fn().mockResolvedValue(new Map()),
  totalBRLTransacao: vi.fn(),
}));

import { carregarAportesMensais, chaveMesAporte } from '../aportesMensais';

const tx = (assetId: string, total: number) => ({
  assetId,
  date: new Date('2026-11-03T00:00:00Z'),
  type: 'compra',
  total,
  price: total,
  quantity: 1,
  fees: null,
  notes: null,
  asset: { type: 'acao', currency: 'BRL' },
});

const NOV = chaveMesAporte(2026, 10);
const DESDE = new Date('2025-11-01T00:00:00Z');
const ATE = new Date('2026-11-06T00:00:00Z');

describe('carregarAportesMensais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      tx('petr4', 10000),
      tx('aposent', 1000),
      tx('sonho', 2000),
    ]);
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { assetId: 'aposent', vinculoAposentadoria: true, planejamentoObjetivoId: null },
      { assetId: 'sonho', vinculoAposentadoria: false, planejamentoObjetivoId: 'obj-1' },
    ]);
  });

  it('padrão (Acompanhamento, seção 5): com vínculo de aposentadoria, só os ativos dele', async () => {
    const porMes = await carregarAportesMensais('u1', DESDE, ATE);
    expect(porMes.get(NOV)).toBe(1000);
  });

  it('respeitarVinculos: false (seção 4a e Resumo): a carteira toda', async () => {
    const porMes = await carregarAportesMensais('u1', DESDE, ATE, { respeitarVinculos: false });
    expect(porMes.get(NOV)).toBe(13000);
    expect(mockPrisma.portfolio.findMany).not.toHaveBeenCalled();
  });
});
