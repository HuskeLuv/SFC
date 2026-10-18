import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  exigir: vi.fn(),
  flagsEua: vi.fn(),
  criteriosVarios: vi.fn(),
  prisma: {
    analiseQuadroLinha: { aggregate: vi.fn(), findMany: vi.fn() },
    assetMultiplesCurrent: { findMany: vi.fn() },
    fiiQuarterly: { findMany: vi.fn() },
    assetPerShareYearly: { findMany: vi.fn() },
    fiiMonthly: { findMany: vi.fn() },
    criteriaParams: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirRecursoAnalise: m.exigir,
  flagsEua: m.flagsEua,
}));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  obterCriteriosVarios: m.criteriosVarios,
}));

import { GET } from '../route';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { _limparCacheComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';

const eua = (symbol: string, classe: 'stock' | 'reit', over = {}) =>
  linhaQuadroDb({
    symbol,
    classe,
    nome: symbol,
    cnpj: 'CIK:0000000001',
    moeda: 'USD',
    preco: 100 as never,
    pl: 25,
    dy12mPct: 2,
    dpa: 1.5,
    fcoPorAcao: classe === 'reit' ? 4.4 : null,
    dividendosFcoPct: classe === 'reit' ? 73 : null,
    perfilCriterios: classe,
    ...over,
  });

const LINHAS = [
  ...LINHAS_FIXTURE,
  eua('AAPL', 'stock'),
  eua('MSFT', 'stock'),
  eua('O', 'reit'),
  eua('PLD', 'reit'),
  eua('BRK.B', 'stock'),
];

const chamar = (q: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/comparador${q}`));

/** Todas as strings de um JSON. */
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}

describe('GET /api/analise-ativos/comparador — Stocks e REITs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetarCacheLinhasQuadro();
    _limparCacheComparador();
    m.exigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
    m.flagsEua.mockReturnValue({ eua: true, euaPreco: false });
    m.prisma.analiseQuadroLinha.aggregate.mockResolvedValue({
      _max: { geradoEm: new Date('2026-10-17T11:30:00Z') },
    });
    m.prisma.analiseQuadroLinha.findMany.mockResolvedValue(LINHAS);
    m.prisma.assetMultiplesCurrent.findMany.mockResolvedValue([]);
    m.prisma.fiiQuarterly.findMany.mockResolvedValue([]);
    m.prisma.assetPerShareYearly.findMany.mockResolvedValue([]);
    m.prisma.fiiMonthly.findMany.mockResolvedValue([]);
    m.prisma.criteriaParams.findFirst.mockResolvedValue({ version: 3, params: CRITERIA_PARAMS_V3 });
    m.criteriosVarios.mockResolvedValue(new Map());
  });

  it('stocks da mesma classe: grupos EUA, critérios do perfil stock, sem cotação', async () => {
    const res = await chamar('?t=AAPL,MSFT,brk-b');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ComparadorResposta;
    expect(body.classe).toBe('stock');
    expect(body.tickers).toEqual(['AAPL', 'MSFT', 'BRK.B']);
    expect(Object.keys(body.criterios.rotulos)).toEqual([
      'rec',
      'luc',
      'ebitda',
      'mg',
      'dl',
      'fcl',
    ]);
    expect(body.grupos.map((g) => g.codigo)).toEqual(['qualidade', 'endividamento', 'dividendos']);
    expect(body.ativos[0].preco).toMatchObject({ estado: 'ausente', motivo: 'licenca' });
    for (const t of strings(body)) {
      expect(encontrarProibidasV2(t, { ignorarLiterais: true }), t).toEqual([]);
      expect(t).not.toMatch(/S&P|MSCI/);
    }
  });

  it('REITs: geração de caixa com Caixa op./ação e Div./caixa op.', async () => {
    const body = (await (await chamar('?t=O,PLD')).json()) as ComparadorResposta;
    expect(body.classe).toBe('reit');
    expect(body.grupos[0].codigo).toBe('geracaoCaixa');
    expect(body.grupos[0].linhas.map((l) => l.codigo)).toEqual(['fcoAcaoEua', 'divFcoEua']);
    expect(body.grupos[0].linhas[0].valores.O).toEqual({ estado: 'ok', valor: 4.4 });
    expect(Object.keys(body.criterios.rotulos)).toContain('fco_acao');
  });

  it('stock × REIT (ou EUA × Brasil) = 400 com o texto do bloqueio', async () => {
    for (const q of ['?t=AAPL,O', '?t=O,AAPL', '?t=WEGE3,AAPL']) {
      const res = await chamar(q);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        TEXTOS_EUA.comparador.mistoBloqueado,
      );
    }
  });

  it('sem a chave EUA: ticker EUA é formato inválido, como hoje', async () => {
    m.flagsEua.mockReturnValue({ eua: false, euaPreco: false });
    expect((await chamar('?t=AAPL,MSFT')).status).toBe(400);
    const body = (await (await chamar('?t=WEGE3,AAPL')).json()) as ComparadorResposta;
    expect(body.tickers).toEqual(['WEGE3']);
    expect(body.ignorados).toEqual([{ ticker: 'AAPL', motivo: 'formato' }]);
  });
});
