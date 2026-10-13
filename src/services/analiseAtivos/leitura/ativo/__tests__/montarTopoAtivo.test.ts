import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import {
  LINHA_AURE3,
  LINHA_HCTR11,
  LINHA_HGLG11,
  LINHA_TGMA3,
  LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  CRITERIOS_ATIVO_HGLG11,
  CRITERIOS_ATIVO_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';

const m = vi.hoisted(() => ({
  linhas: new Map<string, unknown>(),
  versao: vi.fn(),
  criterios: vi.fn(),
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

vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', () => ({
  obterCriteriosAtivo: m.criterios,
}));

import {
  _limparCacheTopo,
  hojeSaoPaulo,
  montarTopoAtivo,
} from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';

const AGORA = new Date('2026-10-02T15:00:00Z');

/** Chaves (recursivas) de um JSON. */
function chaves(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => chaves(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      chaves(x, out);
    }
  }
  return out;
}

const PROIBIDAS_CHAVE = /indice|semaforo|destaque|nota|rating|score/i;

beforeEach(() => {
  _limparCacheTopo();
  m.linhas.clear();
  for (const l of [LINHA_WEGE3, LINHA_TGMA3, LINHA_AURE3, LINHA_HGLG11, LINHA_HCTR11]) {
    m.linhas.set((l as AnaliseQuadroLinha).symbol, l);
  }
  m.versao.mockReset().mockResolvedValue('v1');
  m.criterios
    .mockReset()
    .mockImplementation(async (_p: unknown, t: string) =>
      t === 'WEGE3' ? CRITERIOS_ATIVO_WEGE3 : t === 'HGLG11' ? CRITERIOS_ATIVO_HGLG11 : null,
    );
  const p = m.prisma;
  p.assetScore.findFirst.mockReset().mockResolvedValue(null);
  p.assetMultiplesCurrent.findUnique.mockReset().mockResolvedValue(null);
  p.assetPerShareYearly.findMany.mockReset().mockResolvedValue([]);
  p.assetMultiplesYearly.findMany.mockReset().mockResolvedValue([]);
  p.assetCorporateActionCheck.findMany.mockReset().mockResolvedValue([]);
  p.assetEvento.findMany.mockReset().mockResolvedValue([]);
  p.assetProventoAuditado.findMany.mockReset().mockResolvedValue([]);
  p.assetFundamentalsPeriod.findFirst.mockReset().mockResolvedValue(null);
  p.fiiMonthly.findMany.mockReset().mockResolvedValue([]);
  p.$queryRaw.mockReset().mockResolvedValue([]);
});

describe('montarTopoAtivo', () => {
  it('ticker fora da área → null', async () => {
    expect(await montarTopoAtivo('XXXX3', { agora: AGORA })).toBeNull();
  });

  it('WEGE3: cabeçalho sem tag de índice de mercado, cotação com data, 8 KPIs', async () => {
    const r = await montarTopoAtivo('wege3', { agora: AGORA });
    expect(r).not.toBeNull();
    expect(r!.ticker).toBe('WEGE3');
    expect(r!.tags.join(' ')).not.toMatch(/IBOV|Ibovespa|IFIX/i);
    expect(r!.cotacao.data).toBe('2026-09-29');
    expect(r!.kpis).toHaveLength(8);
    expect(r!.educacao.href).toBe('/educacao');
    expect(r!.versao).toBe('v1');
    expect(JSON.stringify(r).length).toBeLessThan(30_000);
  });

  it('v2.4: sem Índice, semáforo nem referência do Índice; critérios das 3 janelas', async () => {
    const r = await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(r).not.toHaveProperty('indice');
    expect(r).not.toHaveProperty('semaforo');
    expect(r).not.toHaveProperty('tickerReferenciaIndice');
    expect(m.prisma.assetScore.findFirst).not.toHaveBeenCalled();
    expect(r!.criterios).toEqual(CRITERIOS_ATIVO_WEGE3);
    expect(Object.keys(r!.criterios!.janelas).sort()).toEqual(['10', '3', '5']);
    expect(m.criterios).toHaveBeenCalledWith(m.prisma, 'WEGE3');
    // as 3 janelas na mesma resposta e o topo inteiro abaixo de 30 KB
    expect(JSON.stringify(r).length).toBeLessThan(30_000);
  });

  it('v2.4: nenhuma chave /indice|semaforo|destaque|nota/ no JSON (ação e FII, params v2)', async () => {
    for (const t of ['WEGE3', 'TGMA3', 'AURE3', 'HGLG11', 'HCTR11']) {
      const l = m.linhas.get(t) as AnaliseQuadroLinha;
      m.linhas.set(t, { ...l, paramsVersion: 2, flags: [...l.flags, 'conf:proventos:x@2026-01'] });
    }
    for (const t of ['WEGE3', 'TGMA3', 'AURE3', 'HGLG11', 'HCTR11']) {
      const r = await montarTopoAtivo(t, { agora: AGORA });
      expect(r!.frescorBlocos).toBeDefined();
      expect(chaves(r).filter((k) => PROIBIDAS_CHAVE.test(k))).toEqual([]);
    }
  });

  it('sem avaliação de critérios ou falha na leitura → criterios null (o topo não quebra)', async () => {
    let r = await montarTopoAtivo('TGMA3', { agora: AGORA });
    expect(r!.criterios).toBeNull();
    _limparCacheTopo();
    m.criterios.mockRejectedValue(new Error('criteria_eval fora'));
    r = await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(r).not.toBeNull();
    expect(r!.criterios).toBeNull();
  });

  it('HCTR11: FII de papel, critérios ausentes', async () => {
    const r = await montarTopoAtivo('HCTR11', { agora: AGORA });
    expect(r!.criterios).toBeNull();
    expect(r!.classe).toBe('fii');
    expect(r!.tags[0]).toBe('FII de papel');
  });

  it('FII consulta informe mensal e cotação de fim de mês; ações não', async () => {
    await montarTopoAtivo('HGLG11', { agora: AGORA });
    expect(m.prisma.fiiMonthly.findMany).toHaveBeenCalledTimes(1);
    expect(m.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(m.prisma.assetEvento.findMany).not.toHaveBeenCalled();
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(m.prisma.fiiMonthly.findMany).toHaveBeenCalledTimes(1);
    expect(m.prisma.assetEvento.findMany).toHaveBeenCalledTimes(1);
  });

  it('cache por ticker:versão — a segunda leitura não consulta o banco; versão nova refaz', async () => {
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(m.prisma.assetMultiplesCurrent.findUnique).toHaveBeenCalledTimes(1);
    expect(m.criterios).toHaveBeenCalledTimes(1);
    m.versao.mockResolvedValue('v2');
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(m.prisma.assetMultiplesCurrent.findUnique).toHaveBeenCalledTimes(2);
  });

  it('cache expira em 30 min', async () => {
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    await montarTopoAtivo('WEGE3', { agora: new Date(AGORA.getTime() + 31 * 60_000) });
    expect(m.prisma.assetMultiplesCurrent.findUnique).toHaveBeenCalledTimes(2);
  });

  it('data de hoje em São Paulo', () => {
    expect(hojeSaoPaulo(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01');
  });
});
