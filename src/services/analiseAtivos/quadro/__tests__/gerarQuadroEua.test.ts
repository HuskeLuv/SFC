/**
 * Quadro EUA (fatia B): montagem pura das linhas stock/reit conforme o contrato "Quadro EUA" de
 * src/types/analiseAtivosEua.ts e gravação SÓ das classes EUA.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  gerarQuadroEua,
  montarLinhasQuadroEua,
  type EntradaQuadroEua,
} from '@/services/analiseAtivos/quadro/gerarQuadroEua';
import type { CompactoSimbolo } from '@/services/analiseAtivos/repositorio/criterios';
import type { EmpresaEua } from '@/services/analiseAtivos/repositorio/eua';
import type { BrutoSec, FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { CLASSES_EUA } from '@/types/analiseAtivosApi';
import fixture from '../../regras/criterios/__tests__/fixtures/eua-dev.json';

const EMPRESAS = fixture.empresas as unknown as Array<{
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  sic: number;
  nome: string;
  fys: FySec[];
}>;

function empresa(symbol: string, extra: Partial<EmpresaEua> = {}): EmpresaEua {
  const e = EMPRESAS.find((x) => x.symbol === symbol)!;
  return {
    cik: e.cik,
    symbol,
    symbolSec: symbol.replace('.', '-'),
    symbolNorm: symbol.replace('.', ''),
    principal: true,
    nome: e.nome,
    classe: e.classe,
    sic: e.sic,
    ehFinanceira: e.ehFinanceira,
    bolsa: 'NYSE',
    segmento: e.classe === 'reit' ? 'net_lease' : null,
    exercicioFimMmdd: '1231',
    publicFloatUsd: 3e10,
    publicFloatData: '2025-06-30',
    cikFundamentos: e.cik,
    noUniverso: true,
    ...extra,
  };
}

const COMPACTO_O: CompactoSimbolo = {
  perfil: 'reit',
  paramsVersion: 3,
  criterios: { '5': { n: 3, de: 6, m: [['rec', 'atende', 'cresceu em 5 de 5 anos']] } },
};

function entrada(extra: Partial<EntradaQuadroEua> = {}): EntradaQuadroEua {
  const empresas = [empresa('AAPL', { bolsa: 'Nasdaq' }), empresa('O')];
  const brutos = new Map<string, BrutoSec>(
    empresas.map((e) => [
      e.cikFundamentos,
      { cik: e.cikFundamentos, fys: EMPRESAS.find((x) => x.cik === e.cik)!.fys },
    ]),
  );
  return {
    hoje: '2026-10-17',
    geradoEm: new Date('2026-10-17T11:30:00Z'),
    empresas,
    brutos,
    compactos: new Map([['O', COMPACTO_O]]),
    assets: new Map([['AAPL', 'asset-aapl']]),
    cotacoes: new Map([['AAPL', { close: 250, date: '2026-10-16', anterior: 245 }]]),
    comPreco: false,
    ...extra,
  };
}

describe('montarLinhasQuadroEua', () => {
  it('mapeia o contrato Quadro EUA (sem preço sem a chave EUA_PRECO)', () => {
    const r = montarLinhasQuadroEua(entrada());
    expect(r.porClasse).toEqual({ stock: 1, reit: 1 });
    const aapl = r.linhas.find((l) => l.symbol === 'AAPL')!;
    expect(aapl).toMatchObject({
      classe: 'stock',
      cnpj: 'CIK:0000320193',
      noQuadro: true,
      foraDoQuadroMotivo: null,
      temScore: false,
      estadoIndice: 'sem_score',
      setor: 'Indústria',
      segmento: null,
      moeda: 'USD',
      bolsa: 'Nasdaq',
      preco: null,
      precoData: null,
      variacaoDiaPct: null,
      pl: null,
      pvp: null,
      dy12mPct: null,
      assetId: 'asset-aapl',
      paramsVersion: null,
    });
    expect(aapl.margemLiquidaPct).toBeGreaterThan(20);
    expect((aapl.serie10a as unknown as unknown[]).length).toBe(10);
    // sem criteria_eval ainda: colunas de critérios ausentes (null no banco)
    expect(aapl.criterios).toBeUndefined();
    expect(r.alertas.map((a) => a.codigo)).toEqual(['quadro_eua_sem_criterios']);

    const o = r.linhas.find((l) => l.symbol === 'O')!;
    expect(o).toMatchObject({
      classe: 'reit',
      setor: 'Finanças, seguros e imóveis',
      segmento: 'Net lease',
      perfilCriterios: 'reit',
      paramsVersion: 3,
      criterios: COMPACTO_O.criterios,
    });
    expect(o.fcoPorAcao).toBeCloseTo(4.4, 2);
    expect(o.dividendosFcoPct).toBeCloseTo(73.1, 0);
    expect(o.dpa).toBeCloseTo(3.217, 3);
  });

  it('com a chave EUA_PRECO: preço, data, variação e P/L do último fechamento', () => {
    const aapl = montarLinhasQuadroEua(entrada({ comPreco: true })).linhas.find(
      (l) => l.symbol === 'AAPL',
    )!;
    expect(aapl.preco).toBe(250);
    expect(aapl.precoData).toEqual(new Date('2026-10-16T00:00:00.000Z'));
    expect(aapl.variacaoDiaPct).toBeCloseTo(2.04, 2);
    expect(aapl.pl).toBeGreaterThan(0);
  });

  it('flags SEC do último FY (EBITDA pelo degrau do pré-IR no O)', () => {
    const o = montarLinhasQuadroEua(entrada()).linhas.find((l) => l.symbol === 'O')!;
    expect(o.flags).toEqual(['ebitda_pre_ir']);
  });
});

describe('gerarQuadroEua', () => {
  function ctx(): JobContexto & { alertas: AlertaJob[] } {
    const alertas: AlertaJob[] = [];
    return {
      prisma: {} as PrismaClient,
      prazo: Date.now() + 60_000,
      restanteMs: () => 60_000,
      estourouPrazo: () => false,
      alertar: (a) => alertas.push(a),
      contar: vi.fn(),
      params: SCORING_PARAMS_V1,
      paramsVersion: 1,
      hoje: '2026-10-17',
      origem: 'script',
      aplicar: true,
      alertas,
    };
  }

  it('grava pelo gravador isolado com CLASSES_EUA', async () => {
    const gravar = vi.fn(async (_p: unknown, linhas: readonly unknown[]) => linhas.length);
    const r = await gerarQuadroEua(ctx(), { carregar: async () => entrada(), gravar });
    expect(gravar).toHaveBeenCalledWith(expect.anything(), expect.any(Array), CLASSES_EUA);
    const linhas = gravar.mock.calls[0][1] as Array<{ classe: string }>;
    expect(linhas.every((l) => l.classe === 'stock' || l.classe === 'reit')).toBe(true);
    expect(r.detalhes).toMatchObject({ linhas: 2, linhasGravadas: 2, comCriterios: 1 });
  });

  it('universo vazio ⇒ alerta e nada é apagado', async () => {
    const gravar = vi.fn();
    const c = ctx();
    await gerarQuadroEua(c, { carregar: async () => entrada({ empresas: [] }), gravar });
    expect(gravar).not.toHaveBeenCalled();
    expect(c.alertas.map((a) => a.codigo)).toContain('quadro_eua_vazio');
  });
});
