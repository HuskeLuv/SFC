/**
 * GET /valuation de um FII com ticker↔CNPJ não conferido (fii_ticker_map.conferido=false, flag
 * cnpj_em_conferencia na linha do Quadro). Ponta a ponta pela rota, com o serviço real e o banco
 * mockado: os números do informe CVM (P/VP, VP/cota, obrigações, vacância, cotistas, taxa de adm.)
 * saem 'em conferência', sem barra nem histórico; DY e rendimento (proventos da B3) continuam.
 * Caso do dev: RCFA11 devolvia P/VP 0,0039 (VP/cota de outro CNPJ).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const mockExigir = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  assetMultiplesCurrent: { findMany: vi.fn() },
  assetMultiplesYearly: { findMany: vi.fn() },
  assetPerShareYearly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({
  obterLinhaQuadro: vi.fn(),
  obterLinhasQuadroApi: vi.fn(),
  versaoQuadro: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return { ...real, ...mockLeitor };
});
vi.mock('@/services/analiseAtivos/repositorio/acoes', () => ({ fundamentosVigentes: vi.fn() }));

import { GET } from '../route';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { ItemValuation, ValuationResposta } from '@/types/analiseAtivosApi';

const ANOS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016–2025 (fechados em 2026)
const EM_CONF = {
  estado: 'ausente',
  motivo: 'cnpj_em_conferencia',
  texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
};

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/valuation`), {
    params: Promise.resolve({ ticker }),
  });

function item(r: ValuationResposta, codigo: string): ItemValuation {
  const i = r.grupos.flatMap((g) => g.itens).find((x) => x.codigo === codigo);
  if (!i) throw new Error(`sem item ${codigo}`);
  return i;
}

function prepararFii(flags: string[], versao: string) {
  const linha = linhaQuadroDb({
    symbol: 'RCFA11',
    classe: 'fii',
    cnpj: '99999999000199',
    nome: 'Fundo em conferência',
    fiiTipo: 'tijolo',
    regua: 'fii_tijolo',
    preco: new Prisma.Decimal('8'),
    dy12mPct: 12,
    flags,
  });
  mockLeitor.obterLinhaQuadro.mockImplementation(async (s: string) =>
    s === 'RCFA11' ? linha : null,
  );
  mockLeitor.versaoQuadro.mockResolvedValue(versao);
  mockLeitor.obterLinhasQuadroApi.mockResolvedValue([paraLinhaQuadroApi(linha)]);
  // números do informe de OUTRO CNPJ (VP/cota ~2.000 ⇒ P/VP 0,0039)
  mockPrisma.assetMultiplesCurrent.findMany.mockResolvedValue([
    {
      symbol: 'RCFA11',
      lpaTtm: null,
      vpa: null,
      dpa12m: null,
      rend12m: 0.96,
      vpCota: 2051.3,
      pl: null,
      pvp: 0.0039,
      pReceita: null,
      evEbitda: null,
      pFco: null,
      pFcl: null,
      dy12mPct: 12,
      payoutPct: null,
      margemLiquidaPct: null,
      roePct: null,
      roaPct: null,
      roicPct: null,
      divLiqEbitda: null,
      divLiqPl: null,
      liquidezCorrente: null,
      obrigacoesPlPct: 3.2,
      naoSeAplica: [],
    },
  ]);
  mockPrisma.assetMultiplesYearly.findMany.mockResolvedValue(
    ANOS.map((ano, i) => ({
      symbol: 'RCFA11',
      anoFiscal: ano,
      pl: null,
      pvp: 0.004 + i / 1000,
      pReceita: null,
      evEbitda: null,
      pFco: null,
      pFcl: null,
      dyPct: 10 + i / 10,
      payoutPct: null,
      margemLiquidaPct: null,
      roePct: null,
      roaPct: null,
      roicPct: null,
      divLiqEbitda: null,
      divLiqPl: null,
      liquidezCorrente: null,
      vpCota: 2000 + i,
      rendCota12m: 0.9 + i / 100,
      obrigacoesPlPct: 3,
      vacanciaFisicaCvmPct: 5,
    })),
  );
  mockPrisma.assetPerShareYearly.findMany.mockResolvedValue(
    ANOS.map((ano, i) => ({
      symbol: 'RCFA11',
      anoFiscal: ano,
      lpaAjHoje: null,
      vpaAjHoje: null,
      dpaAjHoje: 0.9 + i / 100,
      payoutDmplPct: null,
      rendCota: 0.9 + i / 100,
      vpCotaFim: 2000 + i,
    })),
  );
  mockPrisma.fiiMonthly.findMany.mockResolvedValue(
    ANOS.map((ano) => ({
      cnpj: '99999999000199',
      refMonth: new Date(`${ano}-12-01T00:00:00Z`),
      cotistas: 1000 + ano,
      taxaAdmPct: 1,
      fatorDesdobramento: null,
    })),
  );
}

describe('GET /valuation — FII com ticker↔CNPJ não conferido', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
    mockExigir.mockReset().mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1' });
    Object.values(mockPrisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    Object.values(mockLeitor).forEach((f) => f.mockReset());
  });
  afterEach(() => vi.useRealTimers());

  it('P/VP, VP/cota, obrigações, vacância, taxa e CAGRs do informe saem em conferência', async () => {
    prepararFii(['cnpj_em_conferencia'], 'v-cnpj-1');
    const res = await chamar('RCFA11');
    expect(res.status).toBe(200);
    const r = (await res.json()) as ValuationResposta;

    for (const codigo of ['pvp', 'vpCota', 'vacanciaCvm', 'obrigacoesPl', 'taxaAdm']) {
      const i = item(r, codigo);
      expect(i.atual, codigo).toEqual(EM_CONF);
      expect(i.barra.visivel, codigo).toBe(false);
      expect(i.historico, codigo).toEqual([]);
    }
    expect(item(r, 'cagrVpCota').atual).toEqual(EM_CONF);
    expect(item(r, 'cagrCotistas').atual).toEqual(EM_CONF);
    expect(JSON.stringify(r)).not.toContain('0.0039');

    // mini-gráfico de P/VP sem pontos; DY histórico (proventos B3 ÷ cotação) continua
    const hPvp = r.historicos.find((h) => h.codigo === 'pvp')!;
    expect(hPvp.pontos).toEqual([]);
    expect(hPvp.media).toBeNull();
    expect(r.historicos.find((h) => h.codigo === 'dy12m')!.pontos.length).toBe(10);

    // proventos da B3 continuam
    expect(item(r, 'dy12m').atual).toEqual({ estado: 'ok', valor: 12 });
    expect(item(r, 'rendCota12m').atual).toEqual({ estado: 'ok', valor: 0.96 });
    expect(item(r, 'cagrRendimento').atual.estado).toBe('ok');
  });

  it('o mesmo FII conferido mostra os números do informe (controle)', async () => {
    prepararFii([], 'v-cnpj-2');
    const r = (await (await chamar('RCFA11')).json()) as ValuationResposta;
    expect(item(r, 'pvp').atual).toEqual({ estado: 'ok', valor: 0.0039 });
    expect(item(r, 'vpCota').atual.estado).toBe('ok');
  });
});
