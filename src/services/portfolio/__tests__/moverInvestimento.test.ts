import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MOTIVO_EM_VALIDACAO, MOTIVO_SEM_COTACAO } from '@/lib/carteiraMover';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  watchlist: { findFirst: vi.fn(), update: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
  asset: { findUnique: vi.fn() },
  userChangeLog: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  carregarItemMover,
  estadoAtualDe,
  estadoSnapshotDe,
  moverInvestimento,
  obterCategoriaAtivo,
  obterOpcoesMover,
  restaurarOriginal,
  type ItemMover,
} from '../moverInvestimento';

const asset = (over: Record<string, unknown>) => ({
  id: 'a-1',
  symbol: 'X',
  name: 'X',
  type: 'stock',
  currency: 'BRL',
  source: 'brapi',
  ...over,
});

const posicao = (a: ReturnType<typeof asset>, over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  userId: 'user-1',
  assetId: a.id,
  quantity: 1,
  avgPrice: 1,
  totalInvested: 1,
  objetivo: 0,
  estrategia: null,
  tipoFii: null,
  regiaoEtf: null,
  categoriaOverride: null,
  tipoFundo: null,
  lastUpdate: new Date(),
  planejamentoObjetivoId: null,
  vinculoAposentadoria: false,
  asset: a,
  ...over,
});

const O = asset({ id: 'a-o', symbol: 'O', name: 'Realty Income', type: 'reit', currency: 'USD' });
const AAPL = asset({ id: 'a-aapl', symbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD' });
const IVVB11 = asset({ id: 'a-ivvb', symbol: 'IVVB11', name: 'iShares S&P 500', type: 'etf' });
const VOO = asset({ id: 'a-voo', symbol: 'VOO', name: 'Vanguard', type: 'etf', currency: 'USD' });
const FUNDO_RF = asset({ id: 'a-f', symbol: 'FUNDO-ABC', name: 'Fundo RF', type: 'fund-rf' });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
  mockPrisma.portfolio.update.mockImplementation(async ({ data }) => ({
    ...posicao(AAPL),
    ...data,
  }));
});

describe('carregarItemMover', () => {
  it('lê das compras a seção mais recente que existe (aporte sem o campo não conta) e a pista de RF', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(O));
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { notes: JSON.stringify({ operation: { action: 'aporte' } }) },
      { notes: JSON.stringify({ estrategiaReit: 'growth' }) },
      { notes: JSON.stringify({ estrategiaReit: 'risk' }) },
    ]);
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue({ id: 'fi-1' });
    const item = (await carregarItemMover('user-1', 'posicao', 'p-1'))!;
    expect(item.tipo).toBe('posicao');
    expect(item.temRendaFixa).toBe(true);
    expect(item.notes).toEqual({ estrategiaReit: 'growth', tipoFundo: undefined });
    expect(item.row).not.toHaveProperty('asset');
  });

  it('notes malformadas viram null; linha sem asset = null', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(O));
    mockPrisma.stockTransaction.findMany.mockResolvedValue([{ notes: '{quebrado' }]);
    expect((await carregarItemMover('user-1', 'posicao', 'p-1'))!.notes).toBeNull();

    mockPrisma.portfolio.findFirst.mockResolvedValue({ ...posicao(O), asset: null, assetId: null });
    expect(await carregarItemMover('user-1', 'posicao', 'p-1')).toBeNull();
  });
});

describe('estado atual', () => {
  it('REIT: subgrupo vem de notes.estrategiaReit quando a coluna é null', () => {
    const { asset: a, ...row } = posicao(O);
    const item = {
      tipo: 'posicao',
      row,
      asset: a,
      temRendaFixa: false,
      notes: { estrategiaReit: 'risk' },
    } as unknown as ItemMover;
    expect(estadoAtualDe(item)).toEqual({
      categoria: 'reits',
      base: 'reits',
      subgrupo: 'risk',
      override: false,
    });
  });

  it('estadoSnapshotDe separa posição (colunas + objetivo) e planejado (secao)', () => {
    expect(
      estadoSnapshotDe('posicao', {
        categoriaOverride: 'acoes',
        estrategia: 'value',
        tipoFii: 'tvm',
        regiaoEtf: null,
        tipoFundo: null,
        objetivo: 3,
      }),
    ).toEqual({
      categoriaOverride: 'acoes',
      estrategia: 'value',
      tipoFii: 'tvm',
      regiaoEtf: null,
      tipoFundo: null,
      objetivo: 3,
    });
    expect(
      estadoSnapshotDe('planejado', { categoriaOverride: null, objetivo: 3, secao: 'growth' }),
    ).toEqual({ categoriaOverride: null, secao: 'growth' });
  });
});

describe('moverInvestimento — matriz', () => {
  it('Stock (USD) → REITs grava override reits + estrategia', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(AAPL, { estrategia: 'growth' }));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'reits',
      subgrupo: 'growth',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: 'reits',
      estrategia: 'growth',
    });
  });

  it('ETF: região é livre dentro da aba (USD para Brasil)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(VOO, { regiaoEtf: 'estados_unidos' }));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'etfs',
      subgrupo: 'brasil',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      regiaoEtf: 'brasil',
    });
  });

  it('ETF em dólar ↔ Stocks fica "em validação" (409)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(VOO));
    await expect(
      moverInvestimento('user-1', {
        tipo: 'posicao',
        id: 'p-1',
        categoria: 'stocks',
        subgrupo: 'value',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_EM_VALIDACAO });
  });

  it('ETF B3 (IVVB11) → Ações é permitido', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(IVVB11));
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'acoes',
      subgrupo: 'value',
    });
    expect(r.noop).toBe(false);
  });

  it('Fundo com FixedIncomeAsset: só troca de subgrupo', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(posicao(FUNDO_RF));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue({ id: 'fi' });
    await expect(
      moverInvestimento('user-1', {
        tipo: 'posicao',
        id: 'p-1',
        categoria: 'acoes',
        subgrupo: 'value',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: MOTIVO_SEM_COTACAO });
    const r = await moverInvestimento('user-1', {
      tipo: 'posicao',
      id: 'p-1',
      categoria: 'fimFia',
      subgrupo: 'fidc',
    });
    expect(r.noop).toBe(false);
    expect(mockPrisma.portfolio.update.mock.calls[0][0].data).toMatchObject({
      categoriaOverride: null,
      tipoFundo: 'fidc',
    });
  });
});

describe('restaurarOriginal', () => {
  it('sem histórico (expurgado): só limpa o override', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(AAPL, { categoriaOverride: 'reits', estrategia: 'risk' }),
    );
    const r = await restaurarOriginal('user-1', 'posicao', 'p-1');
    const data = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(data.categoriaOverride).toBeNull();
    expect(data).not.toHaveProperty('estrategia');
    expect(r.destino).toEqual({ categoria: 'stocks', subgrupo: 'risk' });
  });
});

describe('obterOpcoesMover / obterCategoriaAtivo', () => {
  it('null quando o item não existe', async () => {
    expect(await obterOpcoesMover('user-1', 'planejado', 'w-x')).toBeNull();
  });

  it('planejado em Fundos (fiagro sugerido pelo nome) e sem aviso de objetivo', async () => {
    const fii = asset({ id: 'a-agro', symbol: 'RZAG11', name: 'Riza Fiagro', type: 'fii' });
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'w-1',
      userId: 'user-1',
      assetId: fii.id,
      addedAt: new Date(),
      notes: null,
      objetivo: 8,
      secao: 'tijolo',
      categoriaOverride: null,
      asset: fii,
    });
    const r = (await obterOpcoesMover('user-1', 'planejado', 'w-1'))!;
    expect(r.atual).toMatchObject({ categoria: 'fiis', subgrupo: 'tijolo' });
    const fundos = r.destinos.find((d) => d.categoria === 'fimFia')!;
    expect(fundos.subgrupoSugerido).toBe('fiagro');
    expect(fundos.avisos.some((a) => a.includes('objetivo'))).toBe(false);
  });

  it('categoria pelo planejado quando não há posição', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(AAPL);
    mockPrisma.watchlist.findFirst.mockResolvedValue({ categoriaOverride: 'reits' });
    expect(await obterCategoriaAtivo('user-1', 'a-aapl')).toEqual({
      categoria: 'reits',
      override: true,
    });
  });
});
