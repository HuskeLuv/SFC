import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import {
  LINHA_AURE3,
  LINHA_HCTR11,
  LINHA_HGLG11,
  LINHA_TGMA3,
  LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/linhasDb';

const m = vi.hoisted(() => ({
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

import {
  _limparCacheTopo,
  hojeSaoPaulo,
  montarTopoAtivo,
} from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';

const AGORA = new Date('2026-10-02T15:00:00Z');

function scoreDe(over: Record<string, unknown>) {
  return {
    regua: 'acao',
    indiceMf: 5,
    componentes: {},
    pesosEfetivos: {},
    checks: [],
    criteriosAplicaveis: 5,
    criteriosAtendidos: 3,
    motivosIncompleto: [],
    ...over,
  };
}

beforeEach(() => {
  _limparCacheTopo();
  m.linhas.clear();
  for (const l of [LINHA_WEGE3, LINHA_TGMA3, LINHA_AURE3, LINHA_HGLG11, LINHA_HCTR11]) {
    m.linhas.set((l as AnaliseQuadroLinha).symbol, l);
  }
  m.versao.mockReset().mockResolvedValue('v1');
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
    expect(JSON.stringify(r).length).toBeLessThan(25_000);
  });

  it('TGMA3 incompleto: caixa "O que falta"', async () => {
    m.prisma.assetScore.findFirst.mockResolvedValue(
      scoreDe({
        indiceMf: 8.48,
        incompleto: true,
        motivosIncompleto: ['div:fonte_defasada'],
        checks: [
          {
            valor: null,
            codigo: 'dividendos',
            motivo: 'fonte_defasada',
            status: 'sem_dado',
            referencia: 4,
          },
        ],
      }),
    );
    const r = await montarTopoAtivo('TGMA3', { agora: AGORA });
    expect(r!.indice.estado).toBe('incompleto');
    expect(r!.indice.caixaExplicativa).toEqual({
      titulo: 'O que falta',
      itens: ['proventos em conferência'],
    });
    expect(r!.semaforo[0].frase).toBe('Sem dado: proventos em conferência');
  });

  it('AURE3 zero_regra: caixa da regra, sem "o que falta"', async () => {
    m.prisma.assetScore.findFirst.mockResolvedValue(
      scoreDe({
        indiceMf: 0.08,
        componentes: { lucro: { nota: 0, estado: 'zero_regra', motivo: 'prejuizo' } },
        checks: [
          {
            valor: null,
            codigo: 'preco_historico',
            motivo: 'pl_negativo',
            status: 'nao_atende',
            referencia: 0,
          },
        ],
      }),
    );
    const r = await montarTopoAtivo('AURE3', { agora: AGORA });
    expect(r!.indice.estado).toBe('zero_regra');
    expect(r!.indice.caixaExplicativa?.titulo).toBe('Componente zerado pela regra');
    expect(r!.semaforo[0]).toMatchObject({ status: 'nao_atende' });
  });

  it('HCTR11 sem_score: sem número, sem semáforo, mesmo com score antigo gravado', async () => {
    m.prisma.assetScore.findFirst.mockResolvedValue(
      scoreDe({ checks: [{ codigo: 'x', status: 'atende', valor: 1, referencia: 1 }] }),
    );
    const r = await montarTopoAtivo('HCTR11', { agora: AGORA });
    expect(r!.indice).toMatchObject({ estado: 'sem_score', valor: null, componentes: [] });
    expect(r!.semaforo).toEqual([]);
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
    expect(m.prisma.assetScore.findFirst).toHaveBeenCalledTimes(1);
    m.versao.mockResolvedValue('v2');
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(m.prisma.assetScore.findFirst).toHaveBeenCalledTimes(2);
  });

  it('cache expira em 30 min', async () => {
    await montarTopoAtivo('WEGE3', { agora: AGORA });
    await montarTopoAtivo('WEGE3', { agora: new Date(AGORA.getTime() + 31 * 60_000) });
    expect(m.prisma.assetScore.findFirst).toHaveBeenCalledTimes(2);
  });

  it('data de hoje em São Paulo', () => {
    expect(hojeSaoPaulo(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01');
  });
});
