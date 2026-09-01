import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  stockTransaction: { findMany: vi.fn(), update: vi.fn() },
  institution: { findUnique: vi.fn() },
  fixedIncomeAsset: { findFirst: vi.fn().mockResolvedValue(null) },
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
