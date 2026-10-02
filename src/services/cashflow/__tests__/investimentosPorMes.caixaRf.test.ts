/**
 * Mover fase 2 (Reservas + Renda Fixa, MOVER_CAIXA_RF_HABILITADO): no Fluxo de
 * Caixa o item movido vai para a linha da aba nova em todos os meses, o
 * override vence o tesouroDestino da compra e o resgate total preserva a linha.
 * Com a chave desligada, tudo como antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  stockTransaction: { findMany: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { computeInvestimentosPorMes, tipoFluxoDoOverride } from '../investimentosPorMes';

const tx = (overrides: Record<string, unknown>) => ({
  id: 'tx',
  userId: 'u1',
  assetId: 'a-cdb',
  type: 'compra',
  total: 1000,
  fees: 0,
  date: new Date(Date.UTC(2026, 0, 15, 12)),
  createdAt: new Date(Date.UTC(2026, 0, 15, 12)),
  notes: null,
  asset: { type: 'bond', symbol: 'CDB-BANCO-X' },
  ...overrides,
});

/** stockTransaction.findMany por consulta: vendas (distinct), compras de Tesouro (where.asset) e o ano. */
const mockTx = (
  transacoesAno: unknown[],
  comprasTesouro: unknown[] = [],
  ultimasVendas: unknown[] = [],
) =>
  mockPrisma.stockTransaction.findMany.mockImplementation(
    async (args: { where: Record<string, unknown>; distinct?: string[] }) =>
      args.distinct ? ultimasVendas : 'asset' in args.where ? comprasTesouro : transacoesAno,
  );

/** portfolio.findMany por consulta: movidos (where.categoriaOverride), posições (where.assetId), sonho. */
const mockPortfolios = (
  movidos: { assetId: string; categoriaOverride: string }[],
  comPosicao: { assetId: string }[] = [],
) =>
  mockPrisma.portfolio.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      'categoriaOverride' in where ? movidos : 'assetId' in where ? comPosicao : [],
  );

const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
const desligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findMany.mockResolvedValue([]);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Fluxo — CDB movido da Renda Fixa para a Reserva de Emergência', () => {
  const transacoes = [
    tx({ total: 1000 }),
    tx({ total: 500, date: new Date(Date.UTC(2026, 3, 10, 12)) }),
    tx({ type: 'venda', total: 200, date: new Date(Date.UTC(2026, 6, 5, 12)) }),
  ];

  it('chave ligada: aportes e resgates caem em emergency em TODOS os meses; o total não muda', async () => {
    ligar();
    mockPortfolios([{ assetId: 'a-cdb', categoriaOverride: 'reservaEmergencia' }]);
    mockTx(transacoes);

    const { porTipo, totaisPorMes } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.emergency[0]).toBe(1000);
    expect(porTipo.emergency[3]).toBe(500);
    expect(porTipo.emergency[6]).toBe(-200);
    expect(porTipo.bond).toBeUndefined();
    expect(totaisPorMes[0] + totaisPorMes[3] + totaisPorMes[6]).toBe(1300);
  });

  it('chave desligada: override do trio ignorado, linha bond como antes', async () => {
    desligar();
    mockPortfolios([{ assetId: 'a-cdb', categoriaOverride: 'reservaEmergencia' }]);
    mockTx(transacoes);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.bond[0]).toBe(1000);
    expect(porTipo.bond[6]).toBe(-200);
    expect(porTipo.emergency).toBeUndefined();
  });

  it('reserva manual movida entre as Reservas segue a aba nova', async () => {
    ligar();
    mockPortfolios([{ assetId: 'a-res', categoriaOverride: 'reservaOportunidade' }]);
    mockTx([tx({ assetId: 'a-res', asset: { type: 'emergency', symbol: 'RESERVA-EMERG-1' } })]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.opportunity[0]).toBe(1000);
    expect(porTipo.emergency).toBeUndefined();
  });
});

describe('Fluxo — Tesouro de catálogo comprado como reserva', () => {
  const tesouro = { type: 'tesouro-direto', symbol: 'TD-TESOURO-SELIC-2029' };
  const compraEmerg = tx({
    id: 'c1',
    assetId: 'a-td',
    asset: tesouro,
    notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
  });
  const venda = tx({
    id: 'v1',
    assetId: 'a-td',
    asset: tesouro,
    type: 'venda',
    total: 300,
    date: new Date(Date.UTC(2026, 4, 2, 12)),
  });

  it('chave ligada: movido para a Renda Fixa → bond (o override vence o tesouroDestino)', async () => {
    ligar();
    mockPortfolios([{ assetId: 'a-td', categoriaOverride: 'rendaFixaFundos' }]);
    mockTx([compraEmerg, venda], [compraEmerg]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.bond[0]).toBe(1000);
    expect(porTipo.bond[4]).toBe(-300);
    expect(porTipo.emergency).toBeUndefined();
  });

  it('chave desligada: continua na linha da reserva da compra', async () => {
    desligar();
    mockPortfolios([{ assetId: 'a-td', categoriaOverride: 'rendaFixaFundos' }]);
    mockTx([compraEmerg, venda], [compraEmerg]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.emergency[0]).toBe(1000);
    expect(porTipo.emergency[4]).toBe(-300);
    expect(porTipo.bond).toBeUndefined();
  });

  it('sem override (chave ligada): regra de antes (linha da reserva)', async () => {
    ligar();
    mockPortfolios([]);
    mockTx([compraEmerg], [compraEmerg]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.emergency[0]).toBe(1000);
  });

  it('destinos mistos: a base é a 1ª compra marcada por DATA (não a ordem do banco)', async () => {
    ligar();
    const emergAntiga = tx({
      id: 'c-antiga',
      assetId: 'a-td',
      asset: tesouro,
      date: new Date(Date.UTC(2026, 0, 5, 12)),
      notes: JSON.stringify({ tesouroDestino: 'reserva-emergencia' }),
    });
    const oportNova = tx({
      id: 'c-nova',
      assetId: 'a-td',
      asset: tesouro,
      date: new Date(Date.UTC(2026, 2, 5, 12)),
      notes: JSON.stringify({ tesouroDestino: 'reserva-oportunidade' }),
    });
    // Base = Emergência (compra de jan). O override para a Oportunidade vale.
    mockPortfolios([{ assetId: 'a-td', categoriaOverride: 'reservaOportunidade' }]);
    // Banco devolve fora de ordem: a "última" do loop legado seria a Emergência.
    mockTx([emergAntiga, oportNova], [oportNova, emergAntiga]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.opportunity[0]).toBe(1000);
    expect(porTipo.opportunity[2]).toBe(1000);
    expect(porTipo.emergency).toBeUndefined();
  });
});

describe('Fluxo — resgate total de item movido do trio', () => {
  const notasVenda = JSON.stringify({
    operation: { action: 'resgate', categoriaOverride: 'reservaEmergencia' },
  });
  const transacoes = [
    tx({ total: 800 }),
    tx({ type: 'venda', total: 820, notes: notasVenda, date: new Date(Date.UTC(2026, 2, 1, 12)) }),
  ];

  it('chave ligada: sem posição, a compra e a venda ficam na linha da Emergência', async () => {
    ligar();
    mockPortfolios([], []);
    mockTx(transacoes, [], [{ assetId: 'a-cdb', notes: notasVenda }]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.emergency[0]).toBe(800);
    expect(porTipo.emergency[2]).toBe(-820);
    expect(porTipo.bond).toBeUndefined();
  });

  it('chave desligada: volta para a linha do tipo (bond)', async () => {
    desligar();
    mockPortfolios([], []);
    mockTx(transacoes, [], [{ assetId: 'a-cdb', notes: notasVenda }]);

    const { porTipo } = await computeInvestimentosPorMes('u1', 2026);

    expect(porTipo.bond[0]).toBe(800);
    expect(porTipo.emergency).toBeUndefined();
  });
});

describe('tipoFluxoDoOverride — trio', () => {
  it('chave ligada: mapeia as 3 abas novas', () => {
    ligar();
    expect(tipoFluxoDoOverride({ symbol: 'CDB-1', type: 'bond' }, 'reservaEmergencia')).toBe(
      'emergency',
    );
    expect(
      tipoFluxoDoOverride({ symbol: 'RESERVA-EMERG-1', type: 'emergency' }, 'reservaOportunidade'),
    ).toBe('opportunity');
    expect(
      tipoFluxoDoOverride({ symbol: 'TD-SELIC', type: 'tesouro-direto' }, 'rendaFixaFundos', {
        reservaDestino: 'oportunidade',
      }),
    ).toBe('bond');
  });

  it('Tesouro de catálogo sem ctx: override = base RF → null', () => {
    ligar();
    expect(
      tipoFluxoDoOverride({ symbol: 'TD-SELIC', type: 'tesouro-direto' }, 'rendaFixaFundos'),
    ).toBeNull();
  });

  it('RV ↔ trio continua bloqueado; chave desligada → null', () => {
    ligar();
    expect(tipoFluxoDoOverride({ symbol: 'HGLG11', type: 'fii' }, 'rendaFixaFundos')).toBeNull();
    expect(tipoFluxoDoOverride({ symbol: 'CDB-1', type: 'bond' }, 'acoes')).toBeNull();
    desligar();
    expect(tipoFluxoDoOverride({ symbol: 'CDB-1', type: 'bond' }, 'reservaEmergencia')).toBeNull();
    expect(tipoFluxoDoOverride({ symbol: 'BOVA11', type: 'etf' }, 'acoes')).toBe('stock');
  });
});
