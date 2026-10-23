import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

/**
 * Carteira EUA em US$ (fatia FA): gravação de Stocks EUA e REITs pelo POST da operação.
 *  - guardas de currency nos dois sentidos (sem chave);
 *  - unidade pela posição existente, ou pela chave CARTEIRA_EUA_DOLAR_HABILITADO na posição nova;
 *  - price/total em US$, fees em R$, marcador em notes.operation, moedaRegistro no $transaction;
 *  - débito do Caixa para Investir em R$ = total US$ × câmbio + fees.
 */
const mockPrisma = vi.hoisted(() => {
  const base = {
    userChangeLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    institution: { findFirst: vi.fn(), findUnique: vi.fn() },
    asset: { findUnique: vi.fn(), create: vi.fn() },
    stockTransaction: { create: vi.fn(), findMany: vi.fn() },
    portfolio: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    watchlist: { findFirst: vi.fn(), delete: vi.fn() },
    fixedIncomeAsset: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  base.$transaction.mockImplementation((fn: (tx: typeof base) => unknown) => fn(base));
  return base;
});

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));
const mockRecalc = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  invalidatePortfolioSnapshots: vi.fn().mockResolvedValue(undefined),
  recalculatePortfolioFromTransactions: mockRecalc,
}));
vi.mock('@/services/portfolio/applyCorporateActions', () => ({
  applyCorporateActionsToUserPositions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn().mockResolvedValue(undefined),
}));
const mockCaixa = vi.hoisted(() => ({
  debitarCaixa: vi.fn(),
  creditarCaixa: vi.fn(),
  resolverCaixaAba: vi.fn(),
  invalidateCaixaCaches: vi.fn(),
}));
vi.mock('@/services/portfolio/caixaParaInvestir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portfolio/caixaParaInvestir')>()),
  ...mockCaixa,
}));

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/operacao', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const assetAaplManual = {
  id: 'asset-aapl',
  symbol: 'AAPL-1-x',
  name: 'AAPL - $1,000 - 15/01/2026',
  type: 'stock',
  currency: 'USD',
  source: 'manual',
};
const assetReit = {
  id: 'asset-o',
  symbol: 'O',
  name: 'Realty Income',
  type: 'reit',
  currency: 'USD',
};

const compraStockManual = {
  tipoAtivo: 'stock',
  instituicaoId: 'inst-1',
  assetId: 'STOCK-MANUAL',
  ativo: 'AAPL',
  dataCompra: '2026-01-15',
  quantidade: 10,
  cotacaoUnitaria: 100,
  moeda: 'USD',
  cotacaoMoeda: 5,
  taxaCorretagem: 15,
  estrategia: 'growth',
  usarCaixa: true,
};

const movimento = (valor: number) => ({
  total: valor,
  daReserva: 0,
  doLivre: valor,
  aba: 'stocks',
  abaLabel: 'Stocks',
  caixaAntes: null,
  caixaDepois: null,
});

const dadosDaTransacao = () => mockPrisma.stockTransaction.create.mock.calls[0][0].data;
const operacaoDasNotes = () => JSON.parse(dadosDaTransacao().notes).operation;

const chaveOriginal = process.env.CARTEIRA_EUA_DOLAR_HABILITADO;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
  mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'Avenue' });
  mockPrisma.asset.create.mockResolvedValue(assetAaplManual);
  mockPrisma.asset.findUnique.mockResolvedValue(null);
  mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx-1', type: 'compra' });
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });
  mockPrisma.portfolio.update.mockResolvedValue({ id: 'port-1' });
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockCaixa.resolverCaixaAba.mockResolvedValue('stocks');
  mockCaixa.debitarCaixa.mockImplementation((_tx, _u, _aba, valor: number) =>
    Promise.resolve(movimento(valor)),
  );
  mockRecalc.mockResolvedValue(undefined);
  delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
});

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
  else process.env.CARTEIRA_EUA_DOLAR_HABILITADO = chaveOriginal;
});

describe('POST /api/carteira/operacao — guardas de moeda', () => {
  it("tipoAtivo 'stock' com PETR4 (stock em R$) dá 400", async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: 'asset-petr4',
      symbol: 'PETR4',
      name: 'Petrobras',
      type: 'stock',
      currency: 'BRL',
    });
    const res = await POST(createRequest({ ...compraStockManual, assetId: 'asset-petr4' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('dólar');
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it("tipoAtivo 'acao' com Asset stock em US$ dá 400", async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetAaplManual);
    const res = await POST(
      createRequest({
        tipoAtivo: 'acao',
        instituicaoId: 'inst-1',
        assetId: 'asset-aapl',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 100,
        estrategia: 'value',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Stocks EUA');
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it("tipoAtivo 'bdr' com Asset em US$ dá 400", async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: 'asset-bdr',
      symbol: 'AAPL34',
      type: 'bdr',
      currency: 'USD',
    });
    const res = await POST(
      createRequest({
        tipoAtivo: 'bdr',
        instituicaoId: 'inst-1',
        assetId: 'asset-bdr',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 50,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('REIT com Asset em R$ dá 400', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({ ...assetReit, currency: 'BRL' });
    const res = await POST(
      createRequest({
        tipoAtivo: 'reit',
        instituicaoId: 'inst-1',
        assetId: 'asset-o',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 50,
        cotacaoMoeda: 5,
        estrategiaReit: 'value',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/carteira/operacao — stock EUA com a chave LIGADA (posição nova)', () => {
  beforeEach(() => {
    process.env.CARTEIRA_EUA_DOLAR_HABILITADO = 'true';
  });

  it('price US$, total q × US$, fees R$, marcador USD, moedaRegistro no create e débito em R$', async () => {
    const res = await POST(
      // valorInvestido/valorTotal do corpo (em R$) são ignorados para ativo em dólar.
      createRequest({ ...compraStockManual, valorInvestido: 5015, valorTotal: 5015 }),
    );
    expect(res.status).toBe(201);

    const data = dadosDaTransacao();
    expect(data.price).toBe(100);
    expect(data.total).toBe(1000);
    expect(data.fees).toBe(15);
    const op = operacaoDasNotes();
    expect(op).toMatchObject({ unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5 });
    expect(JSON.parse(data.notes).cotacaoMoeda).toBe(5);

    expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        avgPrice: 100,
        totalInvested: 1000,
        moedaRegistro: 'USD',
      }),
    });
    // 1000 × 5 + 15
    expect(mockCaixa.debitarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 'stocks', 5015);
    // Nome do Asset manual em US$ (en-US).
    expect(mockPrisma.asset.create.mock.calls[0][0].data.name).toContain('$1,000');
  });

  it('recompra numa posição BRL legada continua em R$ (a posição manda, não a chave)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetAaplManual);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-legado',
      quantity: 10,
      avgPrice: 520,
      totalInvested: 5200,
      objetivo: 0,
      estrategia: 'growth',
      moedaRegistro: null,
    });
    // Asset manual do usuário (tem Portfolio): passa no usuarioTemAssetManual.
    const res = await POST(
      createRequest({ ...compraStockManual, assetId: 'asset-aapl', usarCaixa: false }),
    );
    expect(res.status).toBe(201);

    const data = dadosDaTransacao();
    expect(data.price).toBe(500); // US$ 100 × 5
    expect(data.total).toBe(5015); // q × US$ × câmbio + fees, como hoje
    expect(operacaoDasNotes().unidade).toBe('BRL');
    const update = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(update).not.toHaveProperty('moedaRegistro');
    expect(update.totalInvested).toBe(5200 + 5015);
  });

  it('falha do recálculo depois do commit deixa moedaRegistro USD gravado no $transaction', async () => {
    const ordem: string[] = [];
    mockPrisma.portfolio.create.mockImplementationOnce(async (args: unknown) => {
      ordem.push('create');
      return { id: 'port-1', args };
    });
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: typeof mockPrisma) => unknown) => {
        const r = await fn(mockPrisma);
        ordem.push('commit');
        return r;
      },
    );
    mockRecalc.mockImplementationOnce(async () => {
      ordem.push('recalc');
      throw new Error('recalc caiu');
    });

    const res = await POST(createRequest(compraStockManual));
    expect(res.status).toBe(500);
    expect(ordem).toEqual(['create', 'commit', 'recalc']);
    expect(mockPrisma.portfolio.create.mock.calls[0][0].data.moedaRegistro).toBe('USD');
  });
});

describe('POST /api/carteira/operacao — stock EUA com a chave DESLIGADA', () => {
  it('posição nova: como hoje (R$ convertido na gravação) + unidade BRL', async () => {
    const res = await POST(createRequest(compraStockManual));
    expect(res.status).toBe(201);

    const data = dadosDaTransacao();
    expect(data.price).toBe(500);
    expect(data.total).toBe(5015);
    expect(data.fees).toBe(15);
    expect(operacaoDasNotes().unidade).toBe('BRL');
    expect(mockPrisma.portfolio.create.mock.calls[0][0].data).not.toHaveProperty('moedaRegistro');
    // Stock legado já está em R$: débito = total gravado.
    expect(mockCaixa.debitarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 'stocks', 5015);
  });

  it('recompra numa posição já em US$ continua em US$ (desligar a chave é seguro)', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetAaplManual);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-usd',
      quantity: 10,
      avgPrice: 100,
      totalInvested: 1000,
      objetivo: 0,
      estrategia: 'growth',
      moedaRegistro: 'USD',
    });
    const res = await POST(
      createRequest({ ...compraStockManual, assetId: 'asset-aapl', usarCaixa: false }),
    );
    expect(res.status).toBe(201);
    expect(dadosDaTransacao().total).toBe(1000);
    expect(operacaoDasNotes().unidade).toBe('USD');
    const update = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(update.moedaRegistro).toBe('USD');
    expect(update.totalInvested).toBe(2000);
  });
});

describe('POST /api/carteira/operacao — REIT', () => {
  it('sempre em US$ (com a chave desligada): marcador USD, moedaRegistro e débito × câmbio + fees', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetReit);
    mockCaixa.resolverCaixaAba.mockResolvedValueOnce('reit');
    const res = await POST(
      createRequest({
        tipoAtivo: 'reit',
        instituicaoId: 'inst-1',
        assetId: 'asset-o',
        dataCompra: '2026-01-15',
        quantidade: 20,
        cotacaoUnitaria: 50,
        cotacaoMoeda: 5.5,
        taxaCorretagem: 10,
        estrategiaReit: 'value',
        valorInvestido: 1000,
        usarCaixa: true,
      }),
    );
    expect(res.status).toBe(201);

    const data = dadosDaTransacao();
    expect(data.price).toBe(50);
    expect(data.total).toBe(1000);
    expect(data.fees).toBe(10);
    expect(operacaoDasNotes()).toMatchObject({ unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5.5 });
    expect(mockPrisma.portfolio.create.mock.calls[0][0].data.moedaRegistro).toBe('USD');
    // 1000 × 5,5 + 10
    expect(mockCaixa.debitarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 'reit', 5510);
  });

  it('recompra de REIT legado (moedaRegistro null) segue em US$', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetReit);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-o',
      quantity: 10,
      avgPrice: 40,
      totalInvested: 400,
      objetivo: 0,
      estrategia: 'value',
      moedaRegistro: null,
    });
    const res = await POST(
      createRequest({
        tipoAtivo: 'reit',
        instituicaoId: 'inst-1',
        assetId: 'asset-o',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 50,
        cotacaoMoeda: 5,
        estrategiaReit: 'value',
      }),
    );
    expect(res.status).toBe(201);
    expect(operacaoDasNotes().unidade).toBe('USD');
    const update = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(update.moedaRegistro).toBe('USD');
    expect(update.totalInvested).toBe(900);
  });
});

describe('POST /api/carteira/operacao — ação BR não passa pelos ramos novos', () => {
  it('PETR4 como ação: sem marcador de unidade e sem moedaRegistro', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: 'asset-petr4',
      symbol: 'PETR4',
      name: 'Petrobras',
      type: 'stock',
      currency: 'BRL',
    });
    const res = await POST(
      createRequest({
        tipoAtivo: 'acao',
        instituicaoId: 'inst-1',
        assetId: 'asset-petr4',
        dataCompra: '2026-01-15',
        quantidade: 100,
        cotacaoUnitaria: 30,
        taxaCorretagem: 5,
        estrategia: 'value',
      }),
    );
    expect(res.status).toBe(201);
    expect(dadosDaTransacao().total).toBe(3005);
    expect(operacaoDasNotes()).not.toHaveProperty('unidade');
    expect(mockPrisma.portfolio.create.mock.calls[0][0].data).not.toHaveProperty('moedaRegistro');
  });
});
