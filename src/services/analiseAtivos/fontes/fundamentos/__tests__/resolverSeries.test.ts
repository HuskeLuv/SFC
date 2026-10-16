import { describe, expect, it } from 'vitest';
import {
  fontesEfetivas,
  SANIDADE_PADRAO,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import {
  escolherSerieJanela,
  resolverSeries,
} from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { pontosDaQualidadeFii } from '@/services/analiseAtivos/repositorio/fontesFundamentos';
import type { PontoSerieVigente, SerieFundamento } from '@/types/analiseAtivosFontes';

const FONTES: FontesParams = {
  prioridade: {
    padrao: ['prov', 'cvm'],
    porSerie: { vacancy_physical: ['prov', 'cvm'], net_income_adjusted: ['prov'] },
  },
  agregacaoAnual: { vacancy_physical: 'ultimo', default_pct: 'media' },
  sanidade: SANIDADE_PADRAO,
  obrigatorias: {},
};

function ponto(
  serie: SerieFundamento,
  ano: number,
  valor: number | null,
  extra: Partial<PontoSerieVigente> = {},
): PontoSerieVigente {
  return {
    symbol: 'WEGE3',
    serie,
    tipoPeriodo: 'FY',
    anoFiscal: ano,
    dtFim: `${ano}-12-31`,
    valor,
    fonte: 'cvm',
    versao: 1,
    incompleto: false,
    ...extra,
  };
}

describe('resolverSeries — prioridade e pontos vigentes', () => {
  it('provedor > cvm por ano; ano só da CVM continua da CVM', () => {
    const r = resolverSeries({
      pontos: [
        ponto('revenue', 2023, 10e6),
        ponto('revenue', 2024, 11e6),
        ponto('revenue', 2024, 12e6, { fonte: 'prov' }),
      ],
      series: ['revenue'],
      fontes: FONTES,
    });
    // BRL → R$ mi
    expect(r.series.revenue).toEqual({ 2023: 10, 2024: 12 });
    expect(r.origens.revenue?.[2023].fonte).toBe('cvm');
    expect(r.origens.revenue?.[2024]).toEqual({
      fonte: 'prov',
      serieUsada: 'revenue',
      fallback: false,
      incompleto: false,
    });
  });

  it('fonte fora da lista de prioridade é ignorada; maior versão vence', () => {
    const r = resolverSeries({
      pontos: [
        ponto('revenue', 2024, 1e6, { fonte: 'outro' }),
        ponto('revenue', 2024, 2e6, { versao: 1 }),
        ponto('revenue', 2024, 3e6, { versao: 2 }),
      ],
      series: ['revenue'],
      fontes: FONTES,
    });
    expect(r.series.revenue).toEqual({ 2024: 3 });
  });

  it('o resolvedor recebe só approved: pending/rejected nunca chegam (contrato do repositório)', () => {
    // o repositório filtra reviewStatus='approved'; sem ponto do provedor, a CVM vale
    const r = resolverSeries({
      pontos: [ponto('net_margin', 2024, 8)],
      series: ['net_margin'],
      fontes: FONTES,
    });
    expect(r.series.net_margin).toEqual({ 2024: 8 });
    expect(r.origens.net_margin?.[2024].fonte).toBe('cvm');
  });

  it('incompleto = ausente, com a origem marcada, quando nenhuma fonte da lista tem valor', () => {
    const r = resolverSeries({
      pontos: [ponto('revenue', 2024, null, { fonte: 'prov', incompleto: true })],
      series: ['revenue'],
      fontes: FONTES,
    });
    expect(r.series.revenue).toEqual({ 2024: null });
    expect(r.origens.revenue?.[2024]).toMatchObject({ fonte: 'prov', incompleto: true });
  });

  it('ponto incompleto do provedor não apaga o valor da CVM (cai para a próxima fonte)', () => {
    const r = resolverSeries({
      pontos: [
        ponto('revenue', 2024, null, { fonte: 'prov', incompleto: true }),
        ponto('revenue', 2024, 5e6),
      ],
      series: ['revenue'],
      fontes: FONTES,
    });
    expect(r.series.revenue).toEqual({ 2024: 5 });
    expect(r.origens.revenue?.[2024]).toMatchObject({ fonte: 'cvm', incompleto: false });
  });

  it('sem params.fontes = só CVM (fontesEfetivas)', () => {
    const r = resolverSeries({
      pontos: [ponto('revenue', 2024, 1e6, { fonte: 'prov' }), ponto('revenue', 2024, 2e6)],
      series: ['revenue'],
      fontes: fontesEfetivas({ fontes: undefined }),
    });
    expect(r.series.revenue).toEqual({ 2024: 2 });
  });

  it('série sem ponto não aparece; unidades fora de BRL não mudam de escala', () => {
    const r = resolverSeries({
      pontos: [ponto('net_debt_ebitda', 2024, 1.5), ponto('income_per_share', 2024, 1.23)],
      series: ['net_debt_ebitda', 'income_per_share', 'ebitda'],
      fontes: FONTES,
    });
    expect(r.series.net_debt_ebitda).toEqual({ 2024: 1.5 });
    expect(r.series.income_per_share).toEqual({ 2024: 1.23 });
    expect(r.series.ebitda).toBeUndefined();
  });
});

describe('resolverSeries — agregação anual (decisão 4)', () => {
  const trimestre = (ano: number, mes: string, valor: number | null, extra = {}) =>
    ponto('vacancy_physical', ano, valor, {
      tipoPeriodo: 'Q',
      dtFim: `${ano}-${mes}`,
      ...extra,
    });

  it("'ultimo' = período de dtFim mais recente do ano (vacância da CVM)", () => {
    const r = resolverSeries({
      pontos: [
        trimestre(2024, '03-31', 12),
        trimestre(2024, '12-31', 7),
        trimestre(2024, '06-30', 15),
      ],
      series: ['vacancy_physical'],
      fontes: FONTES,
    });
    expect(r.series.vacancy_physical).toEqual({ 2024: 7 });
  });

  it("'media' = média dos períodos com valor; algum incompleto = ano incompleto", () => {
    const mes = (m: string, v: number | null, extra = {}) =>
      ponto('default_pct', 2024, v, {
        tipoPeriodo: 'M',
        dtFim: `2024-${m}`,
        fonte: 'prov',
        ...extra,
      });
    const r = resolverSeries({
      pontos: [mes('01-31', 2), mes('02-29', 4), mes('03-31', null)],
      series: ['default_pct'],
      fontes: FONTES,
    });
    expect(r.series.default_pct).toEqual({ 2024: 3 });
    const inc = resolverSeries({
      pontos: [mes('01-31', 2), mes('02-29', null, { incompleto: true })],
      series: ['default_pct'],
      fontes: FONTES,
    });
    expect(inc.series.default_pct).toEqual({ 2024: null });
    expect(inc.origens.default_pct?.[2024].incompleto).toBe(true);
  });

  it('ponto FY do ano prevalece sobre os trimestrais da mesma fonte', () => {
    const r = resolverSeries({
      pontos: [trimestre(2024, '12-31', 9), ponto('vacancy_physical', 2024, 4)],
      series: ['vacancy_physical'],
      fontes: FONTES,
    });
    expect(r.series.vacancy_physical).toEqual({ 2024: 4 });
  });

  it("'ultimo': provedor só com o 1º tri aprovado não vence o 4º tri da CVM", () => {
    const r = resolverSeries({
      pontos: [trimestre(2023, '03-31', 3.5, { fonte: 'prov' }), trimestre(2023, '12-31', 8.26)],
      series: ['vacancy_physical'],
      fontes: FONTES,
    });
    expect(r.series.vacancy_physical).toEqual({ 2023: 8.26 });
    expect(r.origens.vacancy_physical?.[2023].fonte).toBe('cvm');
    // mesmo período nas duas fontes: vale a prioridade (provedor)
    const empate = resolverSeries({
      pontos: [trimestre(2023, '12-31', 7, { fonte: 'prov' }), trimestre(2023, '12-31', 8.26)],
      series: ['vacancy_physical'],
      fontes: FONTES,
    });
    expect(empate.series.vacancy_physical).toEqual({ 2023: 7 });
    expect(empate.origens.vacancy_physical?.[2023].fonte).toBe('prov');
  });

  it('a v2 agrega a vacância pelo último trimestre', () => {
    const r = resolverSeries({
      pontos: [trimestre(2023, '06-30', 20), trimestre(2023, '12-31', 8)],
      series: ['vacancy_physical'],
      fontes: fontesEfetivas(CRITERIA_PARAMS_V2),
    });
    expect(r.series.vacancy_physical).toEqual({ 2023: 8 });
  });

  it('fii_property_quality vira pontos mensais de default_pct e ltv_avg', () => {
    const pontos = pontosDaQualidadeFii([
      {
        symbol: 'KNCR11',
        cnpj: '1',
        periodo: '2024-12-31',
        ltvAvg: 55,
        defaultPct: 1.2,
        fonte: 'prov',
        versao: 1,
        incompleto: false,
      },
      {
        symbol: 'KNCR11',
        cnpj: '1',
        periodo: '2024-06-30',
        ltvAvg: null,
        defaultPct: null,
        fonte: 'prov',
        versao: 1,
        incompleto: false,
      },
    ]);
    expect(pontos.map((p) => [p.serie, p.dtFim, p.valor])).toEqual([
      ['default_pct', '2024-12-31', 1.2],
      ['ltv_avg', '2024-12-31', 55],
    ]);
    const r = resolverSeries({ pontos, series: ['ltv_avg'], fontes: FONTES });
    expect(r.series.ltv_avg).toEqual({ 2024: 55 });
  });
});

describe('escolherSerieJanela — fallback pela janela inteira', () => {
  const anos = [2020, 2021, 2022];
  const def = { serie: 'net_income_adjusted', serieFallback: 'net_income' } as const;
  const serieLucro = (vals: number[]) => vals.map((v, i) => ponto('net_income', 2020 + i, v * 1e6));

  it('todos os anos com o descontado aprovado → usa o descontado, sem obs', () => {
    const r = resolverSeries({
      pontos: [
        ...serieLucro([1, 2, 3]),
        ...[5, 6, 7].map((v, i) =>
          ponto('net_income_adjusted', 2020 + i, v * 1e6, { fonte: 'prov' }),
        ),
      ],
      series: ['net_income', 'net_income_adjusted'],
      fontes: FONTES,
    });
    const j = escolherSerieJanela(r.series, r.origens, def, anos);
    expect(j).toMatchObject({ serie: 'net_income_adjusted', fallback: false, obs: [] });
    expect(j.valores).toEqual({ 2020: 5, 2021: 6, 2022: 7 });
    expect(j.fontes).toEqual(['prov']);
  });

  it('descontado faltando em 1 ano → lucro líquido em TODOS os anos, com obs', () => {
    const r = resolverSeries({
      pontos: [
        ...serieLucro([1, 2, 3]),
        ponto('net_income_adjusted', 2021, 6e6, { fonte: 'prov' }),
        ponto('net_income_adjusted', 2022, 7e6, { fonte: 'prov' }),
      ],
      series: ['net_income', 'net_income_adjusted'],
      fontes: FONTES,
    });
    const j = escolherSerieJanela(r.series, r.origens, def, anos);
    expect(j.serie).toBe('net_income');
    expect(j.fallback).toBe(true);
    // nunca mistura: 2021 e 2022 também vêm do lucro líquido
    expect(j.valores).toEqual({ 2020: 1, 2021: 2, 2022: 3 });
    expect(j.obs).toEqual(['lucro_sem_descontado']);
    expect(j.fontes).toEqual(['cvm']);
  });

  it('sem serieFallback, a principal fica mesmo incompleta; incompleto acende a obs', () => {
    const r = resolverSeries({
      pontos: [
        ponto('revenue', 2020, 1e6),
        ponto('revenue', 2021, null, { fonte: 'prov', incompleto: true }),
        ponto('revenue', 2022, 3e6, { fonte: 'prov' }),
      ],
      series: ['revenue'],
      fontes: FONTES,
    });
    const j = escolherSerieJanela(r.series, r.origens, { serie: 'revenue' }, anos);
    expect(j.serie).toBe('revenue');
    expect(j.fallback).toBe(false);
    expect(j.valores[2021]).toBeNull();
    expect(j.incompleto).toBe(true);
    expect(j.obs).toEqual(['dados_incompletos']);
    expect(j.fontes).toEqual(['prov', 'cvm']);
  });

  it('entrada sem origens (v2.4) → fontes vazias', () => {
    const j = escolherSerieJanela(
      { revenue: { 2020: 1, 2021: 2, 2022: 3 } },
      undefined,
      {
        serie: 'revenue',
      },
      anos,
    );
    expect(j).toMatchObject({ serie: 'revenue', fallback: false, fontes: [], obs: [] });
  });
});
