/**
 * GET /api/historico/ativos com o mover entre Reservas e Renda Fixa (fase 2):
 * a classe segue a aba nova (também o Tesouro de catálogo de reserva, pela 1ª
 * compra marcada). Chave desligada: nenhuma consulta nova e as classes de antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  fixedIncomeAsset: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

import { GET } from '../route';

const linha = (id: string, symbol: string, type: string, categoriaOverride: string | null) => ({
  id,
  userId: 'user-1',
  assetId: `a-${id}`,
  quantity: 10,
  avgPrice: 100,
  totalInvested: 1000,
  lastUpdate: new Date('2026-09-01'),
  categoriaOverride,
  asset: { symbol, name: symbol, type, currency: 'BRL' },
});

const compraReserva = {
  assetId: 'a-td',
  notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
};

const carteira = [
  linha('cdb', 'CDB-BANCO-X', 'bond', 'reservaEmergencia'),
  linha('res', 'RESERVA-EMERG-1', 'emergency', 'reservaOportunidade'),
  linha('td', 'TD-TESOURO-SELIC-2029', 'tesouro-direto', 'rendaFixaFundos'),
  linha('fii', 'HGLG11', 'fii', null),
];

const porCategoria = async () => {
  const res = await GET(new NextRequest('http://localhost/api/historico/ativos'));
  const { secoes } = await res.json();
  return Object.fromEntries(
    secoes.map((s: { categoria: string; ativos: { symbol: string }[] }) => [
      s.categoria,
      s.ativos.map((a) => a.symbol).sort(),
    ]),
  );
};

/** stockTransaction.findMany: compras com notes (reservaDestinoPorAsset) × última transação. */
const mockTx = () =>
  mockPrisma.stockTransaction.findMany.mockImplementation(
    async (args: { where: Record<string, unknown> }) =>
      args.where.type === 'compra' ? [compraReserva] : [],
  );

describe('GET /api/historico/ativos — mover entre Reservas e Renda Fixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findMany.mockResolvedValue(carteira);
    mockTx();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chave ligada: cada item fica na classe da aba nova', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(await porCategoria()).toEqual({
      reservaEmergencia: ['CDB-BANCO-X'],
      reservaOportunidade: ['RESERVA-EMERG-1'],
      rendaFixaFundos: ['TD-TESOURO-SELIC-2029'],
      fiis: ['HGLG11'],
    });
    // A base do Tesouro movido vem da 1ª compra marcada (orderBy determinístico).
    expect(mockPrisma.stockTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'compra', assetId: { in: ['a-td'] } }),
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('chave desligada: classes de antes e nenhuma consulta da base do Tesouro', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    expect(await porCategoria()).toEqual({
      reservaEmergencia: ['RESERVA-EMERG-1'],
      rendaFixaFundos: ['CDB-BANCO-X', 'TD-TESOURO-SELIC-2029'],
      fiis: ['HGLG11'],
    });
    expect(mockPrisma.stockTransaction.findMany).toHaveBeenCalledTimes(1);
  });
});
