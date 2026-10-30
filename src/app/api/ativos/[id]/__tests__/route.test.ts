import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn(), update: vi.fn() },
  institution: { findUnique: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
  bankInvestment: { findFirst: vi.fn().mockResolvedValue(null) },
  assetCorporateAction: { findMany: vi.fn().mockResolvedValue([]) },
  $transaction: vi.fn(),
}));

const mockGetAssetPrices = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockProventosPorSymbol = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
// Mocks pra não importar todo o universo do GET (que arrastaria pricer/dividends/etc).
vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: mockGetAssetPrices,
  getAssetHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/dividendService', () => ({
  getDividends: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/pricing/fundamentalsService', () => ({
  getFundamentals: vi.fn().mockResolvedValue({ pl: null, beta: null, dividendYield: null }),
}));
vi.mock('@/services/portfolio/proventosPorSymbol', () => ({
  proventosRecebidosPorSymbol: mockProventosPorSymbol,
}));
const mockGetCotacaoDolarHoje = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('@/services/market/cambioUsdBrl', () => ({
  getCotacaoDolarHoje: mockGetCotacaoDolarHoje,
}));

import { GET, PATCH } from '../route';
import { parseRangeMonths } from '@/utils/rangeQuery';

// Ticket 01/09/2026 (BBSE3): cards da página do ativo mostravam só preço
// (40,84%) enquanto o Gorila incluía os proventos (108,98%). Agora `posicao`
// segue a convenção das abas: resultado/rentabilidade = preço + proventos.
describe('GET /api/ativos/[id] — rentabilidade com proventos', () => {
  const callGET = (id = 'pf-1') =>
    GET(new NextRequest(`http://localhost/api/ativos/${id}`), {
      params: Promise.resolve({ id }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockPrisma.institution.findUnique.mockResolvedValue(null);
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      userId: 'user-1',
      assetId: 'asset-bbse3',
      quantity: 1000,
      avgPrice: 27.62,
      totalInvested: 27620,
      lastUpdate: new Date('2020-06-09'),
      planejamentoObjetivoId: null,
      vinculoAposentadoria: false,
      asset: {
        id: 'asset-bbse3',
        symbol: 'BBSE3',
        name: 'BB Seguridade',
        type: 'stock',
        source: 'manual',
      },
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        type: 'compra',
        quantity: 1000,
        price: 27.62,
        total: 27620,
        date: new Date('2020-06-09'),
        fees: 0,
        notes: null,
      },
    ]);
    mockGetAssetPrices.mockResolvedValue(new Map([['BBSE3', 38.9]]));
  });

  it('resultado e rentabilidade incluem os proventos brutos; só-preço fica exposto à parte', async () => {
    mockProventosPorSymbol.mockResolvedValue(new Map([['BBSE3', 18820.02]]));

    const res = await callGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.posicao.saldoBruto).toBeCloseTo(38900, 2);
    expect(data.posicao.valorAplicado).toBe(27620);
    expect(data.posicao.resultadoPreco).toBeCloseTo(11280, 2);
    expect(data.posicao.rentabilidadePreco).toBeCloseTo(40.84, 1);
    expect(data.posicao.proventosRecebidos).toBeCloseTo(18820.02, 2);
    // (38.900 + 18.820,02 − 27.620) / 27.620 = 108,98% — o "TIR" do Gorila
    expect(data.posicao.resultado).toBeCloseTo(30100.02, 2);
    expect(data.posicao.rentabilidade).toBeCloseTo(108.98, 1);
  });

  it('sem proventos, resultado e rentabilidade continuam iguais ao só-preço', async () => {
    mockProventosPorSymbol.mockResolvedValue(new Map());

    const res = await callGET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.posicao.proventosRecebidos).toBe(0);
    expect(data.posicao.resultado).toBeCloseTo(data.posicao.resultadoPreco, 6);
    expect(data.posicao.rentabilidade).toBeCloseTo(40.84, 1);
  });
});

// Carteira EUA em US$: a página mostra a posição na unidade gravada + o R$ como informação.
describe('GET /api/ativos/[id] — moeda da posição', () => {
  const callGET = (id = 'pf-1') =>
    GET(new NextRequest(`http://localhost/api/ativos/${id}`), {
      params: Promise.resolve({ id }),
    });
  const posicao = (over: Record<string, unknown>, asset: Record<string, unknown>) => ({
    id: 'pf-1',
    userId: 'user-1',
    assetId: 'asset-1',
    lastUpdate: new Date('2026-05-10'),
    planejamentoObjetivoId: null,
    vinculoAposentadoria: false,
    moedaRegistro: null,
    totalInvestedBrl: null,
    ...over,
    asset: { id: 'asset-1', source: 'manual', ...asset },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
    mockPrisma.institution.findUnique.mockResolvedValue(null);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
    mockProventosPorSymbol.mockResolvedValue(new Map());
    mockGetCotacaoDolarHoje.mockResolvedValue({
      taxa: 5.4,
      data: new Date('2026-10-22T00:00:00Z'),
      fonte: 'indicador',
    });
  });

  it("REIT em US$: moeda 'USD', valores em US$ e o equivalente em R$", async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(
        { quantity: 4, avgPrice: 110, totalInvested: 440, totalInvestedBrl: 2300 },
        { symbol: 'O-1700000000000-abc', name: 'Realty Income', type: 'reit', currency: 'USD' },
      ),
    );
    mockGetAssetPrices.mockResolvedValue(new Map());

    const data = await (await callGET()).json();
    expect(data.posicao).toMatchObject({
      moeda: 'USD',
      precoMedio: 110,
      cotacaoAtual: 110,
      valorAplicado: 440,
      saldoBruto: 440,
      cotacaoDolar: 5.4,
      valorAplicadoBRL: 2300,
      taxaData: '2026-10-22',
    });
    expect(data.posicao.saldoBrutoBRL).toBeCloseTo(2376, 2);
  });

  it("stock legado em R$: moeda 'BRL' e a cotação em US$ vira R$ (sem comparar US$ com R$)", async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(
        { quantity: 2, avgPrice: 1000, totalInvested: 2000 },
        { symbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD' },
      ),
    );
    mockGetAssetPrices.mockResolvedValue(new Map([['AAPL', 200]]));

    const data = await (await callGET()).json();
    expect(data.posicao.moeda).toBe('BRL');
    expect(data.posicao.cotacaoAtual).toBeCloseTo(1080, 2);
    expect(data.posicao.saldoBruto).toBeCloseTo(2160, 2);
  });

  it('PETR4 não consulta o câmbio', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(
      posicao(
        { quantity: 100, avgPrice: 30, totalInvested: 3000 },
        { symbol: 'PETR4', name: 'Petrobras', type: 'stock', currency: 'BRL' },
      ),
    );
    mockGetAssetPrices.mockResolvedValue(new Map([['PETR4', 40]]));

    const data = await (await callGET()).json();
    expect(data.posicao).toMatchObject({ moeda: 'BRL', cotacaoAtual: 40, saldoBrutoBRL: 4000 });
    expect(mockGetCotacaoDolarHoje).not.toHaveBeenCalled();
  });
});

const createPatchRequest = (body: object) =>
  new NextRequest('http://localhost/api/ativos/pf-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const callPATCH = (body: object, id = 'pf-1') =>
  PATCH(createPatchRequest(body), { params: Promise.resolve({ id }) });

describe('PATCH /api/ativos/[id] — Bug #11', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('atualiza instituicaoId em todas as transações preservando o restante de notes', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({
      id: 'inst-novo',
      nome: 'Terra Investimentos',
    });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        notes: JSON.stringify({
          operation: { instituicaoId: 'inst-antigo', tipoAtivo: 'acoes-brasil' },
          extra: 'preserva-me',
        }),
      },
      {
        id: 'tx-2',
        notes: JSON.stringify({
          operation: { instituicaoId: 'inst-antigo' },
        }),
      },
    ]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    const res = await callPATCH({ instituicaoId: 'inst-novo' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.instituicao).toEqual({ id: 'inst-novo', nome: 'Terra Investimentos' });

    // Ambas as transações foram atualizadas com a nova instituicaoId
    expect(mockPrisma.stockTransaction.update).toHaveBeenCalledTimes(2);

    const calls = mockPrisma.stockTransaction.update.mock.calls;
    const notes1 = JSON.parse(calls[0][0].data.notes);
    const notes2 = JSON.parse(calls[1][0].data.notes);

    expect(notes1.operation.instituicaoId).toBe('inst-novo');
    expect(notes2.operation.instituicaoId).toBe('inst-novo');

    // Campos não relacionados preservados
    expect(notes1.operation.tipoAtivo).toBe('acoes-brasil');
    expect(notes1.extra).toBe('preserva-me');
  });

  it('preserva notes que não eram JSON como `raw` (não perde conteúdo)', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-novo', nome: 'XP' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      { id: 'tx-legacy', notes: 'observação livre do usuário, não JSON' },
    ]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    await callPATCH({ instituicaoId: 'inst-novo' });

    const updatedNotes = JSON.parse(mockPrisma.stockTransaction.update.mock.calls[0][0].data.notes);
    expect(updatedNotes.raw).toBe('observação livre do usuário, não JSON');
    expect(updatedNotes.operation.instituicaoId).toBe('inst-novo');
  });

  it('cria operation={} quando notes é null', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'Inst' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([{ id: 'tx-1', notes: null }]);
    mockPrisma.stockTransaction.update.mockResolvedValue({});

    await callPATCH({ instituicaoId: 'inst-1' });

    const updatedNotes = JSON.parse(mockPrisma.stockTransaction.update.mock.calls[0][0].data.notes);
    expect(updatedNotes.operation.instituicaoId).toBe('inst-1');
  });

  it('retorna 404 quando portfolio não pertence ao usuário', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);

    const res = await callPATCH({ instituicaoId: 'inst-1' });
    expect(res.status).toBe(404);
  });

  it('retorna 404 quando instituição não existe', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: 'asset-1',
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue(null);

    const res = await callPATCH({ instituicaoId: 'inst-fantasma' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/Instituição/);
  });

  it('rejeita payload sem instituicaoId (zod)', async () => {
    const res = await callPATCH({});
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando portfolio não tem ativo vinculado', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue({
      id: 'pf-1',
      assetId: null,
      stockId: null,
    });
    mockPrisma.institution.findUnique.mockResolvedValue({ id: 'inst-1', nome: 'X' });

    const res = await callPATCH({ instituicaoId: 'inst-1' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/ativos/[id] — banco emissor (86e2xqh69)', () => {
  const BTG = { id: 'inst-btg', nome: 'BTG Pactual', tipoBacen: 'B1', codigo: '208' };
  const BANCO_XP = { id: 'inst-bxp', nome: 'Banco XP', tipoBacen: 'B1', codigo: '348' };
  const INTER = { id: 'inst-inter', nome: 'Banco Inter', tipoBacen: 'B1', codigo: '077' };
  const XP_CCTVM = { id: 'inst-xpc', nome: 'XP CCTVM', tipoBacen: 'N2', codigo: '102' };
  const CATALOGO: Record<string, typeof BTG> = {
    [BTG.id]: BTG,
    [BANCO_XP.id]: BANCO_XP,
    [INTER.id]: INTER,
    [XP_CCTVM.id]: XP_CCTVM,
  };

  const portfolioCom = (symbol: string) => ({
    id: 'pf-1',
    assetId: 'asset-1',
    asset: { symbol, name: 'CDB Banco XP 2028', source: 'manual' },
  });
  const fiCom = (extra: Record<string, unknown> = {}) => ({
    id: 'fi-1',
    type: 'CDB_PRE',
    tesouroBondType: null,
    emissorInstitutionId: null,
    emissor: null,
    ...extra,
  });
  const notasDa = (instituicaoId: string) => [
    { id: 'tx-1', notes: JSON.stringify({ operation: { instituicaoId } }) },
  ];
  const changesGravados = () =>
    mockPrisma.userChangeLog.create.mock.calls[0]?.[0]?.data?.changes as
      | Array<{ field: string; label: string; before: unknown; after: unknown }>
      | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('RENDA-FIXA-1'));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fiCom());
    mockPrisma.fixedIncomeAsset.update.mockResolvedValue({});
    mockPrisma.bankInvestment.findFirst.mockResolvedValue(null);
    mockPrisma.stockTransaction.findMany.mockResolvedValue(notasDa(BTG.id));
    mockPrisma.stockTransaction.update.mockResolvedValue({});
    mockPrisma.userChangeLog.create.mockResolvedValue({ id: 'log-1' });
    mockPrisma.institution.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => CATALOGO[where.id] ?? null,
    );
  });

  it('grava o emissor e registra "Banco emissor: Mesmo da corretora → Banco XP"', async () => {
    const res = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.emissor).toEqual({ id: BANCO_XP.id, nome: 'Banco XP' });
    expect(mockPrisma.fixedIncomeAsset.update).toHaveBeenCalledWith({
      where: { id: 'fi-1' },
      data: { emissorInstitutionId: BANCO_XP.id },
    });
    expect(mockPrisma.fixedIncomeAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', assetId: 'asset-1' } }),
    );
    expect(changesGravados()).toEqual([
      expect.objectContaining({
        field: 'emissor',
        label: 'Banco emissor',
        before: 'Mesmo da corretora',
        after: 'Banco XP',
      }),
    ]);
    // As notes (corretora) não mudam.
    expect(mockPrisma.stockTransaction.update).not.toHaveBeenCalled();
  });

  it('null limpa o emissor ("usar a corretora")', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(
      fiCom({ emissorInstitutionId: BANCO_XP.id, emissor: { id: BANCO_XP.id, nome: 'Banco XP' } }),
    );
    const res = await callPATCH({ emissorInstituicaoId: null });
    expect(res.status).toBe(200);
    expect((await res.json()).emissor).toBeNull();
    expect(mockPrisma.fixedIncomeAsset.update).toHaveBeenCalledWith({
      where: { id: 'fi-1' },
      data: { emissorInstitutionId: null },
    });
    expect(changesGravados()).toEqual([
      expect.objectContaining({ before: 'Banco XP', after: 'Mesmo da corretora' }),
    ]);
  });

  it('emissor inexistente dá 404 e não grava', async () => {
    const res = await callPATCH({ emissorInstituicaoId: 'inst-fantasma' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Banco emissor não encontrado');
    expect(mockPrisma.fixedIncomeAsset.update).not.toHaveBeenCalled();
  });

  it('corretora pura (N2) que não é a corretora do ativo dá 400', async () => {
    const res = await callPATCH({ emissorInstituicaoId: XP_CCTVM.id });
    expect(res.status).toBe(400);
    expect(mockPrisma.fixedIncomeAsset.update).not.toHaveBeenCalled();
  });

  it('a própria corretora N2 como emissor passa', async () => {
    mockPrisma.stockTransaction.findMany.mockResolvedValue(notasDa(XP_CCTVM.id));
    const res = await callPATCH({ emissorInstituicaoId: XP_CCTVM.id });
    expect(res.status).toBe(200);
  });

  it.each([
    ['CRI', 'RENDA-FIXA-1', fiCom({ type: 'CRI_PRE' })],
    ['LF', 'RENDA-FIXA-1', fiCom({ type: 'LF_PRE' })],
    ['Tesouro', 'TD-TESOURO-SELIC-2029', fiCom({ tesouroBondType: 'Tesouro Selic' })],
    ['DEBENTURE-', 'DEBENTURE-XYZ-1', fiCom()],
    ['FUNDO-', 'FUNDO-RF-1', fiCom()],
  ])('%s dá 400 "não tem banco emissor"', async (_nome, symbol, fi) => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom(symbol));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(fi);
    const res = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Este investimento não tem banco emissor para o FGC.');
    expect(mockPrisma.fixedIncomeAsset.update).not.toHaveBeenCalled();
  });

  it('ativo sem renda fixa (ação) dá 400', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PETR4'));
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(null);
    const res = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(res.status).toBe(400);
  });

  it('PLUGGY-RF- com subtype DEBENTURE dá 400; com CDB aceita', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValue(portfolioCom('PLUGGY-RF-abc'));
    mockPrisma.bankInvestment.findFirst.mockResolvedValue({ subtype: 'DEBENTURE' });
    const negado = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(negado.status).toBe(400);
    expect(mockPrisma.bankInvestment.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', fixedIncomeAssetId: 'fi-1' },
      select: { subtype: true },
    });

    mockPrisma.bankInvestment.findFirst.mockResolvedValue({ subtype: 'CDB' });
    const aceito = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(aceito.status).toBe(200);
  });

  it('trocar a corretora leva o emissor junto quando era igual à anterior', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(
      fiCom({ emissorInstitutionId: BTG.id, emissor: { id: BTG.id, nome: 'BTG Pactual' } }),
    );
    const res = await callPATCH({ instituicaoId: INTER.id });
    expect(res.status).toBe(200);
    expect((await res.json()).emissor).toEqual({ id: INTER.id, nome: 'Banco Inter' });
    expect(mockPrisma.fixedIncomeAsset.update).toHaveBeenCalledWith({
      where: { id: 'fi-1' },
      data: { emissorInstitutionId: INTER.id },
    });
    expect(changesGravados()).toEqual([
      expect.objectContaining({ field: 'emissor', before: 'BTG Pactual', after: 'Banco Inter' }),
    ]);
  });

  it('trocar a corretora mantém o emissor quando era diferente', async () => {
    mockPrisma.fixedIncomeAsset.findFirst.mockResolvedValue(
      fiCom({ emissorInstitutionId: BANCO_XP.id, emissor: { id: BANCO_XP.id, nome: 'Banco XP' } }),
    );
    const res = await callPATCH({ instituicaoId: INTER.id });
    expect(res.status).toBe(200);
    expect((await res.json()).emissor).toEqual({ id: BANCO_XP.id, nome: 'Banco XP' });
    expect(mockPrisma.fixedIncomeAsset.update).not.toHaveBeenCalled();
    // Sem diff de emissor: a corretora continua registrada sem before-state.
    expect(changesGravados()).toBeUndefined();
  });

  it('trocar a corretora sem emissor gravado não inventa um', async () => {
    const res = await callPATCH({ instituicaoId: INTER.id });
    expect(res.status).toBe(200);
    expect((await res.json()).emissor).toBeNull();
    expect(mockPrisma.fixedIncomeAsset.update).not.toHaveBeenCalled();
  });

  it('consultor agindo pelo cliente grava no FI do cliente (targetUserId)', async () => {
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'consultor-1', email: 'c@t.com', role: 'consultant' },
      targetUserId: 'cliente-9',
      actingClient: { id: 'cliente-9' },
    });
    const res = await callPATCH({ emissorInstituicaoId: BANCO_XP.id });
    expect(res.status).toBe(200);
    expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pf-1', userId: 'cliente-9' } }),
    );
    expect(mockPrisma.fixedIncomeAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'cliente-9', assetId: 'asset-1' } }),
    );
    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'cliente-9', actorId: 'consultor-1' }),
      }),
    );
  });
});

/* ================================================================== */
/* parseRangeMonths — query param ?range= (#15/#16/#18 do checklist)  */
/* ================================================================== */

const reqWithRange = (range?: string) =>
  new NextRequest(`http://localhost/api/ativos/pf-1${range ? `?range=${range}` : ''}`);

describe('parseRangeMonths', () => {
  it('default 24M quando nenhum param', () => {
    expect(parseRangeMonths(reqWithRange())).toBe(24);
  });

  it('MAX retorna null (sem cap)', () => {
    expect(parseRangeMonths(reqWithRange('MAX'))).toBeNull();
    expect(parseRangeMonths(reqWithRange('max'))).toBeNull();
  });

  it('converte aliases 12M/24M/36M', () => {
    expect(parseRangeMonths(reqWithRange('12M'))).toBe(12);
    expect(parseRangeMonths(reqWithRange('24M'))).toBe(24);
    expect(parseRangeMonths(reqWithRange('36M'))).toBe(36);
  });

  it('converte aliases 2A/3A/5A/10A', () => {
    expect(parseRangeMonths(reqWithRange('2A'))).toBe(24);
    expect(parseRangeMonths(reqWithRange('3A'))).toBe(36);
    expect(parseRangeMonths(reqWithRange('5A'))).toBe(60);
    expect(parseRangeMonths(reqWithRange('10A'))).toBe(120);
  });

  it('valor inválido cai no default 24', () => {
    expect(parseRangeMonths(reqWithRange('quinze-anos'))).toBe(24);
    expect(parseRangeMonths(reqWithRange(''))).toBe(24);
  });
});
