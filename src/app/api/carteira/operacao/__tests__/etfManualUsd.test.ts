import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

/**
 * ETF americano em US$ (ticket 86e3fq1yh, fatia FA): compra pelo sentinela ETF-MANUAL.
 *  - Asset etf/USD/manual com symbol 'TICKER-<ts>-<rnd>' (ou o do planejado de mesmo ticker);
 *  - price/total em US$ SEM corretagem, fees em R$, marcador USD, moedaRegistro no $transaction;
 *  - região forçada a 'estados_unidos'; débito do caixa = q × p × câmbio + corretagem;
 *  - cotacaoMoeda obrigatório em ativo em dólar; guarda anti-B3; chave como interruptor;
 *  - ETF da B3 (IVVB11) do catálogo na seção EUA: payload idêntico ao de antes.
 */
const mockPrisma = vi.hoisted(() => {
  const base = {
    userChangeLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    institution: { findFirst: vi.fn(), findUnique: vi.fn() },
    asset: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
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

const assetVooManual = {
  id: 'asset-voo',
  symbol: 'VOO-1730000000000-ab3cd11',
  name: 'VOO - $5,000 - 15/01/2026',
  type: 'etf',
  currency: 'USD',
  source: 'manual',
};
const assetIvvb11 = {
  id: 'asset-ivvb11',
  symbol: 'IVVB11',
  name: 'iShares S&P 500',
  type: 'etf',
  currency: 'BRL',
  source: 'brapi',
};

const compraVoo = {
  tipoAtivo: 'etf',
  instituicaoId: 'inst-1',
  assetId: 'ETF-MANUAL',
  ativo: 'voo',
  dataCompra: '2026-01-15',
  quantidade: 10,
  cotacaoUnitaria: 500,
  cotacaoMoeda: 5,
  taxaCorretagem: 10,
  // A região do corpo é ignorada no ETF americano: sempre 'estados_unidos'.
  regiaoEtf: 'brasil',
  usarCaixa: true,
};

const movimento = (valor: number) => ({
  total: valor,
  daReserva: 0,
  doLivre: valor,
  aba: 'etf',
  abaLabel: "ETF's",
  caixaAntes: null,
  caixaDepois: null,
});

const dadosDaTransacao = () => mockPrisma.stockTransaction.create.mock.calls[0][0].data;
const notesDaTransacao = () => JSON.parse(dadosDaTransacao().notes);

const chaveOriginal = process.env.CARTEIRA_EUA_DOLAR_HABILITADO;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
  mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'Avenue' });
  mockPrisma.asset.create.mockImplementation(async ({ data }: { data: object }) => ({
    id: 'asset-novo',
    ...data,
  }));
  mockPrisma.asset.findUnique.mockResolvedValue(null);
  mockPrisma.asset.findFirst.mockResolvedValue(null);
  mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx-1', type: 'compra' });
  mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.portfolio.create.mockResolvedValue({ id: 'port-1' });
  mockPrisma.portfolio.update.mockResolvedValue({ id: 'port-1' });
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockCaixa.resolverCaixaAba.mockResolvedValue('etf');
  mockCaixa.debitarCaixa.mockImplementation((_tx, _u, _aba, valor: number) =>
    Promise.resolve(movimento(valor)),
  );
  mockRecalc.mockResolvedValue(undefined);
  process.env.CARTEIRA_EUA_DOLAR_HABILITADO = 'true';
});

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
  else process.env.CARTEIRA_EUA_DOLAR_HABILITADO = chaveOriginal;
});

describe('POST /api/carteira/operacao — ETF americano (ETF-MANUAL)', () => {
  it('cria Asset etf/USD/manual e grava em US$ sem corretagem, com débito em R$', async () => {
    const res = await POST(createRequest(compraVoo));
    expect(res.status).toBe(201);

    const assetCriado = mockPrisma.asset.create.mock.calls[0][0].data;
    expect(assetCriado).toMatchObject({ type: 'etf', currency: 'USD', source: 'manual' });
    expect(assetCriado.symbol).toMatch(/^VOO-\d{13}-[a-z0-9]+$/);
    expect(assetCriado.name).toContain('VOO - $5,000');

    const data = dadosDaTransacao();
    expect(data.price).toBe(500);
    expect(data.total).toBe(5000); // q × US$, SEM a corretagem
    expect(data.fees).toBe(10); // R$
    const notes = notesDaTransacao();
    expect(notes.cotacaoMoeda).toBe(5);
    expect(notes.operation).toMatchObject({ moeda: 'USD', unidade: 'USD', cotacaoMoeda: 5 });

    expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        avgPrice: 500,
        totalInvested: 5000,
        moedaRegistro: 'USD',
        regiaoEtf: 'estados_unidos',
      }),
    });
    // 10 × 500 × 5 + 10
    expect(mockCaixa.debitarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 'etf', 25010);
    expect(mockRecalc).toHaveBeenCalled();
  });

  it('consulta o guarda anti-B3 com o ticker normalizado (etf/etf-cvm em R$)', async () => {
    await POST(createRequest({ ...compraVoo, ativo: ' voo.sa ' }));
    const where = mockPrisma.asset.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ type: { in: ['etf', 'etf-cvm'] }, currency: 'BRL' });
    expect(where.OR[0].symbol.equals).toBe('VOO');
  });

  it.each([
    ['sem cotacaoMoeda', { cotacaoMoeda: undefined }],
    ['cotacaoMoeda zero', { cotacaoMoeda: 0 }],
    ['cotacaoMoeda negativa', { cotacaoMoeda: -5 }],
    ['ticker vazio', { ativo: '  ' }],
  ])('400 %s', async (_caso, extra) => {
    const res = await POST(createRequest({ ...compraVoo, ...extra }));
    expect(res.status).toBe(400);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it.each(['IVVB11', 'ivvb11.sa'])('400 no ticker da B3 digitado à mão (%s)', async (ticker) => {
    mockPrisma.asset.findFirst.mockResolvedValueOnce({ id: assetIvvb11.id });
    const res = await POST(createRequest({ ...compraVoo, ativo: ticker }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Este ETF é negociado na B3: escolha-o na busca');
    expect(mockPrisma.asset.findFirst.mock.calls[0][0].where.OR[0].symbol.equals).toBe('IVVB11');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('ticker terminado em 11 fora do catálogo NÃO é barrado no back (só aviso no wizard)', async () => {
    const res = await POST(createRequest({ ...compraVoo, ativo: 'ABCD11', usarCaixa: false }));
    expect(res.status).toBe(201);
    expect(mockPrisma.asset.create.mock.calls[0][0].data.symbol).toMatch(/^ABCD11-/);
  });

  it('400 com a chave CARTEIRA_EUA_DOLAR_HABILITADO desligada', async () => {
    delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
    const res = await POST(createRequest(compraVoo));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ETF americano indisponível');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('recompra por assetId real (ETF em US$ do usuário) sem câmbio dá 400', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetVooManual);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-voo',
      quantity: 10,
      avgPrice: 500,
      totalInvested: 5000,
      objetivo: 0,
      regiaoEtf: 'estados_unidos',
      moedaRegistro: 'USD',
    });
    const { cotacaoMoeda: _semCambio, ...semCambio } = compraVoo;
    const res = await POST(
      createRequest({ ...semCambio, assetId: 'asset-voo', regiaoEtf: 'estados_unidos' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('cotação do dólar');
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('recompra por assetId real com câmbio segue em US$ e soma na posição', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetVooManual);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'port-voo',
      quantity: 10,
      avgPrice: 500,
      totalInvested: 5000,
      objetivo: 0,
      regiaoEtf: 'estados_unidos',
      moedaRegistro: 'USD',
    });
    const res = await POST(
      createRequest({
        ...compraVoo,
        assetId: 'asset-voo',
        regiaoEtf: 'estados_unidos',
        usarCaixa: false,
      }),
    );
    expect(res.status).toBe(201);
    expect(dadosDaTransacao().total).toBe(5000);
    expect(notesDaTransacao().operation.unidade).toBe('USD');
    const update = mockPrisma.portfolio.update.mock.calls[0][0].data;
    expect(update).toMatchObject({ totalInvested: 10000, moedaRegistro: 'USD' });
  });

  it('Asset manual de outro usuário (sem Portfolio nem planejado dele) dá 403', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetVooManual);
    const res = await POST(
      createRequest({ ...compraVoo, assetId: 'asset-voo', regiaoEtf: 'estados_unidos' }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('planejado manual de mesmo ticker: reaproveita o Asset e nasce posição nova em USD', async () => {
    const planejado = {
      id: 'plan-voo',
      userId: 'user-123',
      assetId: 'asset-voo',
      objetivo: 8,
      secao: 'estados_unidos',
      categoriaOverride: null,
      notes: null,
      addedAt: new Date('2026-01-01'),
      asset: { ...assetVooManual, name: 'VOO' },
    };
    mockPrisma.watchlist.findFirst.mockResolvedValue(planejado);
    // Sem Portfolio prévio: o planejado vive em watchlists (caminho de posição nova).
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    const res = await POST(createRequest({ ...compraVoo, usarCaixa: false }));
    expect(res.status).toBe(201);

    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    // encontrarPlanejadoManual por prefixo de símbolo do ETF em US$.
    expect(mockPrisma.watchlist.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: 'user-123',
      asset: { type: 'etf', currency: 'USD', source: 'manual', symbol: { startsWith: 'VOO-' } },
    });
    expect(dadosDaTransacao().assetId).toBe('asset-voo');
    expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({ where: { id: 'plan-voo' } });
    expect(mockPrisma.portfolio.update).not.toHaveBeenCalled();
    expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'asset-voo',
        totalInvested: 5000,
        objetivo: 8,
        moedaRegistro: 'USD',
        regiaoEtf: 'estados_unidos',
      }),
    });
  });
});

describe('POST /api/carteira/operacao — ETF da B3 (IVVB11) na seção EUA não muda', () => {
  it('payload idêntico ao de antes: R$, total com corretagem, sem marcador nem moedaRegistro', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetIvvb11);
    const res = await POST(
      createRequest({
        tipoAtivo: 'etf',
        instituicaoId: 'inst-1',
        assetId: 'asset-ivvb11',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 300,
        taxaCorretagem: 5,
        regiaoEtf: 'estados_unidos',
        usarCaixa: true,
      }),
    );
    expect(res.status).toBe(201);

    // Sem guarda anti-B3 (não é entrada manual) e sem Asset novo.
    expect(mockPrisma.asset.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();

    const data = dadosDaTransacao();
    const { notes, date, ...resto } = data;
    expect(date).toEqual(new Date('2026-01-15'));
    expect(resto).toEqual({
      userId: 'user-123',
      assetId: 'asset-ivvb11',
      type: 'compra',
      quantity: 10,
      price: 300,
      total: 3005,
      fees: 5,
    });
    const parsed = JSON.parse(notes);
    expect(parsed).not.toHaveProperty('cotacaoMoeda');
    expect(parsed.operation).toEqual({
      action: 'compra',
      performedBy: { userId: 'user-123', role: 'user', actingClient: null },
      targetUserId: 'user-123',
      tipoAtivo: 'etf',
      instituicaoId: 'inst-1',
      assetId: 'asset-ivvb11',
      symbol: 'IVVB11',
      name: 'iShares S&P 500',
      quantity: 10,
      price: 300,
      total: 3005,
      fees: 5,
      date: '2026-01-15T00:00:00.000Z',
      estrategia: null,
      tipoFii: null,
      moeda: null,
      cotacaoMoeda: null,
      opcaoTipo: null,
      opcaoCompraVenda: null,
    });

    const criado = mockPrisma.portfolio.create.mock.calls[0][0].data;
    const { lastUpdate, ...criadoSemData } = criado;
    expect(lastUpdate).toBeInstanceOf(Date);
    expect(criadoSemData).toEqual({
      userId: 'user-123',
      assetId: 'asset-ivvb11',
      quantity: 10,
      avgPrice: 300,
      totalInvested: 3005,
      regiaoEtf: 'estados_unidos',
    });
    // Caixa em R$ = total gravado.
    expect(mockCaixa.debitarCaixa).toHaveBeenCalledWith(mockPrisma, 'user-123', 'etf', 3005);
  });

  it('com a chave desligada continua igual (a chave só barra o ETF-MANUAL)', async () => {
    delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
    mockPrisma.asset.findUnique.mockResolvedValueOnce(assetIvvb11);
    const res = await POST(
      createRequest({
        tipoAtivo: 'etf',
        instituicaoId: 'inst-1',
        assetId: 'asset-ivvb11',
        dataCompra: '2026-01-15',
        quantidade: 10,
        cotacaoUnitaria: 300,
        taxaCorretagem: 5,
        regiaoEtf: 'estados_unidos',
      }),
    );
    expect(res.status).toBe(201);
    expect(dadosDaTransacao().total).toBe(3005);
    expect(JSON.parse(dadosDaTransacao().notes).operation).not.toHaveProperty('unidade');
  });
});
