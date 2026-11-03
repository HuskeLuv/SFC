import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  dashboardData: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    create: vi.fn(),
  },
  // Caixa para Investir grava dentro de transação (serviço caixaParaInvestir).
  $transaction: vi.fn(),
  // Ativos planejados (sem posição): nenhum nos cenários destes testes.
  watchlist: { findMany: vi.fn().mockResolvedValue([]) },
  asset: { findMany: vi.fn().mockResolvedValue([]) },
  assetPriceHistory: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
}));

mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) =>
  fn(mockPrisma),
);

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('@/services/pricing/assetPriceService', () => ({
  getAssetPrices: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/services/market/marketIndicatorService', () => ({
  getIndicator: vi.fn().mockResolvedValue({ price: 5 }),
}));

// Proventos da aba (resolveProventoEvents): nenhum, salvo quando o teste define.
const mockResolveProventos = vi.hoisted(() => vi.fn());
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventos,
}));

import { GET, POST } from '../route';

/** Evento de mover (UserChangeLog) que tirou o item da aba base. */
const eventoMover = (entityId: string, after: Record<string, unknown>, viaConsultant = false) => ({
  entityId,
  action: 'investimento.mover',
  createdAt: new Date('2026-10-01T12:00:00Z'),
  viaConsultant,
  snapshot: { v: 1, kind: 'mover', data: { categoriaOverride: null }, meta: { after } },
});

type Linha = {
  id: string;
  ticker?: string;
  nome?: string;
  cotacaoAtual?: number;
  valorAtualizado: number;
  movido?: boolean;
  movidoEm?: string;
  movidoViaConsultor?: boolean;
  naoMovivelMotivo?: string;
  planejado?: boolean;
};
type Secao = { ativos: Linha[] } & Record<string, unknown>;
const linhas = (data: { secoes: Secao[] }) => data.secoes.flatMap((s) => s.ativos);

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/etf', { method: 'GET' });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/etf', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/carteira/etf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
    mockResolveProventos.mockResolvedValue({ events: [], total: 0 });
  });

  describe('GET', () => {
    it('returns 401 without auth', async () => {
      const { requireAuthWithActing } = await import('@/utils/auth');
      vi.mocked(requireAuthWithActing).mockRejectedValueOnce(new Error('Não autorizado'));
      const res = await GET(createGetRequest());
      expect(res.status).toBe(401);
    });

    it('returns data with correct shape when no portfolio items', async () => {
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty('resumo');
      expect(data).toHaveProperty('secoes');
      expect(data).toHaveProperty('totalGeral');
      expect(Array.isArray(data.secoes)).toBe(true);
      expect(data.totalGeral.valorAplicado).toBe(0);
    });

    it('returns sections with ETF portfolio data', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'user-1',
          quantity: 50,
          totalInvested: 2500,
          avgPrice: 50,
          objetivo: 10,
          regiaoEtf: 'brasil',
          assetId: 'a1',
          stockId: null,
          stock: null,
          asset: { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'etf', currency: 'BRL' },
          lastUpdate: new Date(),
        },
      ]);
      const res = await GET(createGetRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.secoes.length).toBeGreaterThan(0);
      expect(data.secoes[0].ativos[0].ticker).toBe('BOVA11');
    });
  });

  describe('mover na Carteira (out/2026)', () => {
    const posicao = (over: Record<string, unknown>) => ({
      userId: 'user-1',
      quantity: 10,
      totalInvested: 1000,
      avgPrice: 100,
      objetivo: 0,
      regiaoEtf: null,
      categoriaOverride: null,
      lastUpdate: new Date(),
      ...over,
    });

    it('FII movido para ETFs aparece na região escolhida, com cotação live e selo', async () => {
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      vi.mocked(getAssetPrices).mockResolvedValueOnce(new Map([['XPLG11', 110]]));
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-xplg',
          categoriaOverride: 'etfs',
          regiaoEtf: 'estados_unidos',
          asset: { symbol: 'XPLG11', name: 'XP Log', type: 'fii', currency: 'BRL' },
        }),
      ]);
      mockPrisma.userChangeLog.findMany.mockResolvedValueOnce([
        eventoMover('p-xplg', { categoriaOverride: 'etfs', regiaoEtf: 'estados_unidos' }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      const eua = data.secoes.find((s: Secao) => s.regiao === 'estados_unidos');
      expect(eua.ativos).toHaveLength(1);
      expect(eua.ativos[0]).toMatchObject({
        ticker: 'XPLG11',
        valorAtualizado: 1100,
        movido: true,
      });
    });

    it('ETF movido para Ações some de ETFs; sem override nada muda', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([
        posicao({
          id: 'p-bova',
          categoriaOverride: 'acoes',
          asset: { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'etf', currency: 'BRL' },
        }),
        posicao({
          id: 'p-ivvb',
          asset: { symbol: 'IVVB11', name: 'iShares S&P', type: 'etf', currency: 'BRL' },
        }),
      ]);
      const data = await (await GET(createGetRequest())).json();
      expect(linhas(data).map((l) => l.ticker)).toEqual(['IVVB11']);
      expect(linhas(data)[0]).not.toHaveProperty('movido');
      expect(mockPrisma.userChangeLog.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ETF americano em US$ (nov/2026, ticket 86e3fq1yh)', () => {
    const FX = 5.5;
    const VOO_SYMBOL = 'VOO-1730000000000-ab3cd11';
    const ultimaAtualizacao = new Date('2026-11-03T12:00:00Z');
    const ivvb11 = () => ({
      id: 'p-ivvb',
      userId: 'user-1',
      quantity: 10,
      avgPrice: 300,
      totalInvested: 3000,
      objetivo: 20,
      regiaoEtf: 'estados_unidos',
      categoriaOverride: null,
      moedaRegistro: null,
      totalInvestedBrl: null,
      assetId: 'a-ivvb',
      asset: { symbol: 'IVVB11', name: 'iShares S&P 500', type: 'etf', currency: 'BRL' },
      lastUpdate: ultimaAtualizacao,
    });
    const bova11 = () => ({
      id: 'p-bova',
      userId: 'user-1',
      quantity: 50,
      avgPrice: 120,
      totalInvested: 6000,
      objetivo: 30,
      regiaoEtf: 'brasil',
      categoriaOverride: null,
      moedaRegistro: null,
      totalInvestedBrl: null,
      assetId: 'a-bova',
      asset: { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'etf', currency: 'BRL' },
      lastUpdate: ultimaAtualizacao,
    });
    // Como a FA grava: Asset manual etf/USD, posição em US$ e o custo em R$ pelo câmbio da compra.
    const voo = (over: Record<string, unknown> = {}) => ({
      id: 'p-voo',
      userId: 'user-1',
      quantity: 2,
      avgPrice: 500,
      totalInvested: 1000,
      objetivo: 10,
      regiaoEtf: 'estados_unidos',
      categoriaOverride: null,
      moedaRegistro: 'USD',
      totalInvestedBrl: 5010,
      assetId: 'a-voo',
      asset: {
        symbol: VOO_SYMBOL,
        name: 'VOO - US$ 1.000,00 - 03/11/2026',
        type: 'etf',
        currency: 'USD',
        source: 'manual',
      },
      lastUpdate: ultimaAtualizacao,
      ...over,
    });
    type LinhaEtf = Linha & Record<string, unknown>;
    const linha = (data: { secoes: Secao[] }, id: string) =>
      linhas(data).find((l) => l.id === id) as LinhaEtf;

    beforeEach(async () => {
      const { getIndicator } = await import('@/services/market/marketIndicatorService');
      vi.mocked(getIndicator).mockResolvedValue({ price: FX } as never);
      const { getAssetPrices } = await import('@/services/pricing/assetPriceService');
      // IVVB11 com cotação; o VOO manual não tem quote (cotação congelada no preço médio).
      vi.mocked(getAssetPrices).mockResolvedValue(new Map([['IVVB11', 330]]));
    });

    it('carteira só com ETF da B3 (IVVB11 na seção EUA): resposta idêntica à de antes', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([bova11(), ivvb11()]);
      const data = await (await GET(createGetRequest())).json();
      expect(data).toMatchInlineSnapshot(`
        {
          "alocacaoAtivo": [
            {
              "cor": "#F59E0B",
              "percentual": 64.51612903225806,
              "ticker": "BOVA11",
              "valor": 6000,
            },
            {
              "cor": "#10B981",
              "percentual": 35.483870967741936,
              "ticker": "IVVB11",
              "valor": 3300,
            },
          ],
          "resumo": {
            "caixaParaInvestir": 0,
            "necessidadeAporteTotal": 0,
            "rendimento": 300,
            "rentabilidade": 3.3333333333333335,
            "saldoInicioMes": 9000,
            "valorAtualizado": 9300,
          },
          "secoes": [
            {
              "ativos": [
                {
                  "categoria": "",
                  "cotacaoAtual": 120,
                  "dataUltimaAtualizacao": "2026-11-03T12:00:00.000Z",
                  "id": "p-bova",
                  "indiceRastreado": "outros",
                  "necessidadeAporte": 0,
                  "nome": "iShares Ibovespa",
                  "objetivo": 30,
                  "percentualCarteira": 64.52,
                  "precoAquisicao": 120,
                  "proventos": 0,
                  "quantidade": 50,
                  "quantoFalta": -34.52,
                  "regiao": "brasil",
                  "rentabilidade": 0,
                  "riscoPorAtivo": 64.52,
                  "ticker": "BOVA11",
                  "valorAtualizado": 6000,
                  "valorTotal": 6000,
                },
              ],
              "nome": "Brasil",
              "regiao": "brasil",
              "rentabilidadeMedia": 0,
              "totalNecessidadeAporte": 0,
              "totalObjetivo": 30,
              "totalPercentualCarteira": 64.52,
              "totalProventos": 0,
              "totalQuantidade": 50,
              "totalQuantoFalta": -34.52,
              "totalRisco": 64.52,
              "totalValorAplicado": 6000,
              "totalValorAtualizado": 6000,
            },
            {
              "ativos": [
                {
                  "categoria": "",
                  "cotacaoAtual": 330,
                  "dataUltimaAtualizacao": "2026-11-03T12:00:00.000Z",
                  "id": "p-ivvb",
                  "indiceRastreado": "outros",
                  "necessidadeAporte": 0,
                  "nome": "iShares S&P 500",
                  "objetivo": 20,
                  "percentualCarteira": 35.48,
                  "precoAquisicao": 300,
                  "proventos": 0,
                  "quantidade": 10,
                  "quantoFalta": -15.48,
                  "regiao": "estados_unidos",
                  "rentabilidade": 10,
                  "riscoPorAtivo": 35.48,
                  "ticker": "IVVB11",
                  "valorAtualizado": 3300,
                  "valorTotal": 3000,
                },
              ],
              "nome": "EUA",
              "regiao": "estados_unidos",
              "rentabilidadeMedia": 10,
              "totalNecessidadeAporte": 0,
              "totalObjetivo": 20,
              "totalPercentualCarteira": 35.48,
              "totalProventos": 0,
              "totalQuantidade": 10,
              "totalQuantoFalta": -15.48,
              "totalRisco": 35.48,
              "totalValorAplicado": 3000,
              "totalValorAtualizado": 3300,
            },
          ],
          "tabelaAuxiliar": [
            {
              "cotacaoAtual": 120,
              "loteAproximado": 0,
              "necessidadeAporte": 0,
              "nome": "iShares Ibovespa",
              "quantidade": 50,
              "rentabilidade": 0,
              "ticker": "BOVA11",
              "valorAplicado": 6000,
              "valorAtualizado": 6000,
            },
            {
              "cotacaoAtual": 330,
              "loteAproximado": 0,
              "necessidadeAporte": 0,
              "nome": "iShares S&P 500",
              "quantidade": 10,
              "rentabilidade": 10,
              "ticker": "IVVB11",
              "valorAplicado": 3000,
              "valorAtualizado": 3300,
            },
          ],
          "totalGeral": {
            "necessidadeAporte": 0,
            "objetivo": 50,
            "percentualCarteira": 100,
            "proventos": 0,
            "quantidade": 60,
            "quantoFalta": -50,
            "rentabilidade": 3.3333333333333335,
            "risco": 100,
            "valorAplicado": 9000,
            "valorAtualizado": 9300,
          },
        }
      `);
    });

    it('linha USD: campos base em R$, *USD só de exibição, ticker limpo e moedaRegistro', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([ivvb11(), voo()]);
      const data = await (await GET(createGetRequest())).json();
      const v = linha(data, 'p-voo');
      expect(v).toMatchObject({
        ticker: 'VOO',
        symbol: VOO_SYMBOL,
        moedaRegistro: 'USD',
        regiao: 'estados_unidos',
        quantidade: 2,
        precoAquisicao: 2505,
        valorTotal: 5010,
        valorAtualizado: 5500,
        precoAquisicaoUSD: 500,
        valorTotalUSD: 1000,
        cotacaoAtualUSD: 500,
        valorAtualizadoUSD: 1000,
        proventosUSD: 0,
        semCambio: false,
      });
      expect(v.cotacaoAtual).toBeCloseTo(2750, 6);
      expect(v.rentabilidade).toBeCloseTo(((5500 - 5010) / 5010) * 100, 6);
      expect(data.cotacaoDolar).toBe(FX);
      expect(data.posicoesSemCambio).toBe(0);
      expect(data.taxaData).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('IVVB11 na seção EUA ao lado do VOO continua em R$ e sem campos USD', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([ivvb11()]);
      const sozinho = linha(await (await GET(createGetRequest())).json(), 'p-ivvb');
      mockPrisma.portfolio.findMany.mockResolvedValue([ivvb11(), voo()]);
      const misto = linha(await (await GET(createGetRequest())).json(), 'p-ivvb');
      for (const campo of [
        'symbol',
        'moedaRegistro',
        'precoAquisicaoUSD',
        'valorTotalUSD',
        'cotacaoAtualUSD',
        'valorAtualizadoUSD',
        'proventosUSD',
        'semCambio',
      ]) {
        expect(misto).not.toHaveProperty(campo);
      }
      expect(misto).toMatchObject({
        ticker: 'IVVB11',
        precoAquisicao: 300,
        valorTotal: 3000,
        cotacaoAtual: 330,
        valorAtualizado: 3300,
        rentabilidade: 10,
      });
      // Só o % da aba (e o que deriva dele) muda com a nova linha.
      const semPct = (l: LinhaEtf) => {
        const {
          percentualCarteira: _p,
          riscoPorAtivo: _r,
          quantoFalta: _q,
          necessidadeAporte: _n,
          ...resto
        } = l;
        return resto;
      };
      expect(semPct(misto)).toEqual(semPct(sozinho));
    });

    it('provento manual em US$ do VOO, gravado pelo symbol cru, vira R$ e entra na rentabilidade', async () => {
      mockResolveProventos.mockResolvedValue({
        events: [{ symbol: VOO_SYMBOL, gross: 10, net: 10, moeda: 'USD' }],
        total: 10,
      });
      mockPrisma.portfolio.findMany.mockResolvedValue([ivvb11(), voo()]);
      const data = await (await GET(createGetRequest())).json();
      const v = linha(data, 'p-voo');
      expect(v.proventosUSD).toBe(10);
      expect(v.proventos).toBeCloseTo(55, 6);
      expect(v.rentabilidade).toBeCloseTo(((5500 + 55 - 5010) / 5010) * 100, 6);
      expect(data.totalGeral.proventos).toBeCloseTo(55, 6);
    });

    it('totais da seção EUA e da aba somam só R$', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([bova11(), ivvb11(), voo()]);
      const data = await (await GET(createGetRequest())).json();
      const eua = data.secoes.find((s: Secao) => s.regiao === 'estados_unidos');
      expect(eua.totalValorAplicado).toBeCloseTo(3000 + 5010, 6);
      expect(eua.totalValorAtualizado).toBeCloseTo(3300 + 5500, 6);
      expect(data.totalGeral.valorAplicado).toBeCloseTo(6000 + 3000 + 5010, 6);
      expect(data.totalGeral.valorAtualizado).toBeCloseTo(6000 + 3300 + 5500, 6);
      const v = linha(data, 'p-voo');
      expect(v.percentualCarteira).toBeCloseTo((5500 / (6000 + 3300 + 5500)) * 100, 1);
      expect(data.alocacaoAtivo.map((a: { ticker: string }) => a.ticker)).toContain('VOO');
    });

    it('ETF americano movido para a seção Brasil continua em US$ e os totais em R$', async () => {
      mockPrisma.portfolio.findMany.mockResolvedValue([bova11(), voo({ regiaoEtf: 'brasil' })]);
      const data = await (await GET(createGetRequest())).json();
      const brasil = data.secoes.find((s: Secao) => s.regiao === 'brasil');
      expect(brasil.ativos.map((a: Linha) => a.ticker)).toEqual(['BOVA11', 'VOO']);
      expect(linha(data, 'p-voo')).toMatchObject({ moedaRegistro: 'USD', valorTotal: 5010 });
      expect(brasil.totalValorAplicado).toBeCloseTo(6000 + 5010, 6);
      expect(data.cotacaoDolar).toBe(FX);
    });

    it('sem câmbio: o VOO fica fora das somas e recebe semCambio', async () => {
      const { getIndicator } = await import('@/services/market/marketIndicatorService');
      vi.mocked(getIndicator).mockResolvedValue(null as never);
      mockResolveProventos.mockResolvedValue({
        events: [{ symbol: VOO_SYMBOL, gross: 10, net: 10, moeda: 'USD' }],
        total: 10,
      });
      mockPrisma.portfolio.findMany.mockResolvedValue([ivvb11(), voo()]);
      const data = await (await GET(createGetRequest())).json();
      const v = linha(data, 'p-voo');
      expect(v).toMatchObject({
        semCambio: true,
        valorTotal: 0,
        valorAtualizado: 0,
        proventos: 0,
        proventosUSD: 10,
        valorAtualizadoUSD: 1000,
      });
      expect(data.totalGeral.valorAplicado).toBe(3000);
      expect(data.totalGeral.valorAtualizado).toBe(3300);
      expect(data.totalGeral.proventos).toBe(0);
      expect(data.cotacaoDolar).toBeNull();
      expect(data.posicoesSemCambio).toBe(1);
    });
  });

  describe('POST', () => {
    it('updates caixa para investir', async () => {
      // Reserva da aba precisa caber no caixa total (bolso total com reservas).
      mockPrisma.dashboardData.findMany.mockResolvedValueOnce([
        { metric: 'caixa_para_investir_consolidado', value: 10000 },
      ]);
      mockPrisma.dashboardData.findFirst.mockResolvedValue(null);
      mockPrisma.dashboardData.create.mockResolvedValue({});
      const res = await POST(createPostRequest({ caixaParaInvestir: 2000 }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
