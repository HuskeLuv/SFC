/**
 * GET /ativos/[ticker] (topo) de um FII com ticker↔CNPJ não conferido (flag cnpj_em_conferencia
 * na linha do Quadro). Ponta a ponta pela rota, com o serviço real e o banco mockado: os KPIs do
 * informe CVM (P/VP, patrimônio, cotistas, Obrigações/PL, vacância) saem 'em conferência' e os
 * subtítulos não citam VP/cota nem a data do informe; o gráfico VP×Cotação fica sem VP e o
 * informe mensal nem é lido. Cotação e proventos (B3) continuam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({
  exigir: vi.fn(),
  linhas: new Map<string, unknown>(),
  versao: vi.fn(),
  prisma: {
    assetScore: { findFirst: vi.fn() },
    assetMultiplesCurrent: { findUnique: vi.fn() },
    assetPerShareYearly: { findMany: vi.fn() },
    assetMultiplesYearly: { findMany: vi.fn() },
    assetCorporateActionCheck: { findMany: vi.fn() },
    assetEvento: { findMany: vi.fn() },
    assetProventoAuditado: { findMany: vi.fn() },
    assetFundamentalsPeriod: { findFirst: vi.fn() },
    fiiMonthly: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: m.exigir,
}));
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/services/analiseAtivos/observabilidade/frescor', () => ({
  obterPainelFrescor: vi.fn().mockResolvedValue({ geradoEm: '', camadas: {}, atrasadas: [] }),
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return {
    ...real,
    versaoQuadro: m.versao,
    obterLinhaQuadro: vi.fn(async (s: string) => m.linhas.get(s.toUpperCase()) ?? null),
  };
});

import { GET } from '../route';
import { _limparCacheTopo } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { AtivoTopoResposta } from '@/types/analiseAtivosApi';

const EM_CONF = {
  estado: 'ausente',
  motivo: 'cnpj_em_conferencia',
  texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
};

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}`), {
    params: Promise.resolve({ ticker }),
  });

function prepararFii(flags: string[], over: Parameters<typeof linhaQuadroDb>[0] = {}) {
  m.linhas.set(
    'RCFA11',
    linhaQuadroDb({
      symbol: 'RCFA11',
      classe: 'fii',
      cnpj: '99999999000199',
      fiiTipo: 'tijolo',
      regua: 'fii_tijolo',
      preco: new Prisma.Decimal('8'),
      dy12mPct: 12,
      flags,
      ...over,
    }),
  );
  m.prisma.assetMultiplesCurrent.findUnique.mockResolvedValue({
    plMedia10a: null,
    plPontosHistorico: 0,
    dpa12m: null,
    rend12m: 0.96,
    vpCota: 2051.3, // de outro CNPJ
    lpaTtm: null,
    precoData: new Date('2026-09-29T00:00:00Z'),
  });
  m.prisma.fiiMonthly.findMany.mockResolvedValue(
    Array.from({ length: 24 }, (_, i) => ({
      refMonth: new Date(Date.UTC(2024, i, 1)),
      vpCota: new Prisma.Decimal('2051.3'),
    })),
  );
  m.prisma.$queryRaw.mockResolvedValue(
    Array.from({ length: 24 }, (_, i) => ({
      date: new Date(Date.UTC(2024, i + 1, 0)),
      close: new Prisma.Decimal('8'),
    })),
  );
}

describe('GET /ativos/[ticker] — FII com ticker↔CNPJ não conferido', () => {
  beforeEach(() => {
    _limparCacheTopo();
    m.linhas.clear();
    m.exigir.mockReset().mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1' });
    m.versao.mockReset().mockResolvedValue('v1');
    for (const grupo of Object.values(m.prisma)) {
      if (typeof grupo === 'function') {
        (grupo as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
        continue;
      }
      for (const f of Object.values(grupo)) {
        const fn = f as ReturnType<typeof vi.fn>;
        fn.mockReset().mockResolvedValue(fn === m.prisma.assetScore.findFirst ? null : []);
      }
    }
    m.prisma.assetMultiplesCurrent.findUnique.mockResolvedValue(null);
    m.prisma.assetFundamentalsPeriod.findFirst.mockResolvedValue(null);
  });

  it('KPIs do informe em conferência, sem VP/cota nem data do informe; DY e cotação seguem', async () => {
    prepararFii(['cnpj_em_conferencia']);
    const res = await chamar('RCFA11');
    expect(res.status).toBe(200);
    const r = (await res.json()) as AtivoTopoResposta;
    const kpi = (c: string) => r.kpis.find((k) => k.codigo === c)!;

    for (const c of ['pvp', 'patrimonio', 'cotistas', 'obrigacoesPl', 'vacanciaCvm']) {
      expect(kpi(c).valor, c).toEqual(EM_CONF);
      expect(kpi(c).sub, c).toBeNull();
    }
    const subs = r.kpis.map((k) => k.sub ?? '').join(' | ');
    expect(subs).not.toMatch(/VP|informe/i);

    // informe mensal nem é lido: gráfico sem VP, frescor sem data do informe
    expect(m.prisma.fiiMonthly.findMany).not.toHaveBeenCalled();
    expect(r.grafico.serieA.pontos.every((p) => p.valor === null)).toBe(true);
    expect(r.frescor.fii).toBeNull();

    expect(kpi('dy12m').valor).toEqual({ estado: 'ok', valor: 12 });
    expect(kpi('rendCota12m').valor).toEqual({ estado: 'ok', valor: 0.96 });
    expect(r.cotacao.preco).toBe(8);
  });

  it('o mesmo FII conferido mostra VP/cota e o gráfico com o informe (controle)', async () => {
    prepararFii([], { pvp: 0.0039 });
    const r = (await (await chamar('RCFA11')).json()) as AtivoTopoResposta;
    const pvp = r.kpis.find((k) => k.codigo === 'pvp')!;
    expect(pvp.valor).toEqual({ estado: 'ok', valor: 0.0039 });
    expect(pvp.sub).toMatch(/2\.051,30/);
    expect(r.grafico.serieA.pontos.some((p) => p.valor !== null)).toBe(true);
  });
});
