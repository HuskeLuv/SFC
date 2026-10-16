import { describe, expect, it } from 'vitest';
import {
  avaliarSanidade,
  confiancaMinima,
  diferencaPct,
  filtrarCvmPelaSanidade,
  marcarIncompletos,
  type PontoPeriodo,
} from '@/services/analiseAtivos/fontes/fundamentos/sanidadeFonte';
import {
  fontesEfetivas,
  SANIDADE_PADRAO,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import type { PontoSerieVigente } from '@/types/analiseAtivosFontes';

const F = fontesEfetivas(CRITERIA_PARAMS_V2);
const comAplicaA = (aplicaA: FontesParams['sanidade']['aplicaA']): FontesParams => ({
  ...F,
  sanidade: { ...SANIDADE_PADRAO, aplicaA },
});

describe('sanidade da §6 (função pura)', () => {
  it('variação de 41% contra o período anterior aprovado → pending; 39% → approved', () => {
    expect(avaliarSanidade({ camada: 'provedor', valor: 141, anterior: 100 }, F)).toEqual({
      reviewStatus: 'pending',
      motivos: ['variacao'],
    });
    expect(avaliarSanidade({ camada: 'provedor', valor: 139, anterior: 100 }, F).reviewStatus).toBe(
      'approved',
    );
    // queda também conta (|Δ|)
    expect(avaliarSanidade({ camada: 'provedor', valor: 55, anterior: 100 }, F).motivos).toEqual([
      'variacao',
    ]);
  });

  it('divergência de 6% contra a CVM do mesmo período → pending (a CVM prevalece); 4% → approved', () => {
    expect(avaliarSanidade({ camada: 'provedor', valor: 106, cvm: 100 }, F)).toEqual({
      reviewStatus: 'pending',
      motivos: ['divergencia_cvm'],
    });
    expect(avaliarSanidade({ camada: 'provedor', valor: 104, cvm: 100 }, F).reviewStatus).toBe(
      'approved',
    );
  });

  it('confiança 0,7 (< 0,8) → pending', () => {
    expect(avaliarSanidade({ camada: 'provedor', valor: 10, confianca: 0.7 }, F)).toEqual({
      reviewStatus: 'pending',
      motivos: ['confianca'],
    });
    expect(avaliarSanidade({ camada: 'provedor', valor: 10, confianca: 0.9 }, F).reviewStatus).toBe(
      'approved',
    );
  });

  it("aplicaA ['provedor'] (padrão) não marca a CVM; aplicaA ['cvm'] marca", () => {
    const e = { camada: 'cvm' as const, valor: 200, anterior: 100 };
    expect(avaliarSanidade(e, F).reviewStatus).toBe('approved');
    expect(avaliarSanidade(e, comAplicaA(['cvm']))).toEqual({
      reviewStatus: 'pending',
      motivos: ['variacao'],
    });
    // só 'cvm' na lista: o provedor passa sem checagem
    expect(
      avaliarSanidade({ camada: 'provedor', valor: 200, anterior: 100 }, comAplicaA(['cvm']))
        .reviewStatus,
    ).toBe('approved');
  });

  it('valor nulo nunca vai para revisão; anterior zero com valor ≠ 0 = variação infinita', () => {
    expect(
      avaliarSanidade({ camada: 'provedor', valor: null, anterior: 100 }, F).reviewStatus,
    ).toBe('approved');
    expect(diferencaPct(5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(diferencaPct(0, 0)).toBe(0);
    expect(confiancaMinima({ ltvAvg: 0.9, defaultPct: 0.75 })).toBe(0.75);
    expect(confiancaMinima(null)).toBeNull();
  });

  it('a CVM com aplicaA incluindo cvm: o ponto com salto > 40% sai (fica em revisão)', () => {
    const p = (ano: number, valor: number): PontoSerieVigente => ({
      symbol: 'WEGE3',
      serie: 'revenue',
      tipoPeriodo: 'FY',
      anoFiscal: ano,
      dtFim: `${ano}-12-31`,
      valor,
      fonte: 'cvm',
      versao: 1,
      incompleto: false,
    });
    const pontos = [p(2023, 100), p(2024, 200), p(2025, 210)];
    expect(filtrarCvmPelaSanidade(pontos, F).pontos).toHaveLength(3);
    const r = filtrarCvmPelaSanidade(pontos, comAplicaA(['provedor', 'cvm']));
    expect(r.emRevisao.map((x) => x.anoFiscal)).toEqual([2024, 2025]);
    // 2025 compara com o último aprovado (2023 = 100): +110% também sai
    expect(r.pontos.map((x) => x.anoFiscal)).toEqual([2023]);
  });
});

describe('séries obrigatórias (§6: incompleto, valor null)', () => {
  const base = (serie: PontoPeriodo['serie'], valor: number | null): PontoPeriodo => ({
    symbol: 'WEGE3',
    serie,
    tipoPeriodo: 'FY',
    anoFiscal: 2025,
    dtFim: '2025-12-31',
    valor,
  });

  it('obrigatória ausente no período vira ponto incompleto; nula também', () => {
    const r = marcarIncompletos(
      [base('net_income_adjusted', 10), base('net_income', null)],
      () => 'br_acoes',
      F,
      (b) => ({ ...b }),
    );
    const porSerie = Object.fromEntries(r.map((p) => [p.serie, p]));
    expect(porSerie.revenue).toMatchObject({ valor: null, incompleto: true });
    expect(porSerie.net_income).toMatchObject({ valor: null, incompleto: true });
    expect(porSerie.net_income_adjusted.incompleto).toBeUndefined();
  });

  it('só as obrigatórias da MESMA periodicidade (trimestre de vacância não exige séries anuais)', () => {
    const vac: PontoPeriodo = {
      symbol: 'HGLG11',
      serie: 'vacancy_physical',
      tipoPeriodo: 'Q',
      anoFiscal: 2025,
      dtFim: '2025-03-31',
      valor: 3,
    };
    expect(
      marcarIncompletos(
        [vac],
        () => 'br_fii',
        F,
        (b) => ({ ...b }),
      ),
    ).toHaveLength(1);
  });
});
