import { describe, it, expect } from 'vitest';
import { montarDividendos } from '@/services/analiseAtivos/leitura/ativo/dividendosAnuais';

const HOJE = '2026-10-02';

// dev 29/09/2026: DPA ajustado e payout (DMPL) por ano
const WEGE3 = [
  [2016, 0.1447, 54.3],
  [2017, 0.1376, 50.5],
  [2018, 0.164, 49.5],
  [2019, 0.1702, 44.2],
  [2020, 0.2172, 39.1],
  [2021, 0.4399, 49.4],
  [2022, 0.5157, 51.4],
  [2023, 0.6148, 45.0],
  [2024, 0.7558, 52.5],
  [2025, 2.4506, 161.3],
].map(([ano, valor, payoutPct]) => ({ ano, valor, payoutPct }));

describe('montarDividendos', () => {
  it('WEGE3: 2025 (2,45 contra 0,76) em conferência e fora do CAGR; 2021 (dobrou com lucro) não', () => {
    const d = montarDividendos({
      classe: 'acao',
      hoje: HOJE,
      anos: WEGE3,
      ult12m: 2.0032,
      ult12mData: '2026-09-29',
    });
    expect(d.anos.find((a) => a.ano === 2025)?.suspeito).toBe(true);
    expect(d.anos.find((a) => a.ano === 2021)?.suspeito).toBeUndefined();
    expect(d.cagr5aPct).toBeNull();
    expect(d.cagrMotivo).toBe('anos em conferência ficam fora do crescimento anual');
    expect(d.selo).toBe('proventos_em_conferencia');
    expect(d.ult12m).toEqual({ valor: 2.0032, dataRef: '2026-09-29' });
    expect(d.unidade).toBe('dpa');
  });

  it('HGLG11: 2026 (jan–ago, 5,5) fica fora; CAGR de 5 anos fechados', () => {
    const anos = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((ano, i) => ({
      ano,
      valor: [11.03, 13.57, 16.5, 13.6, 13.2, 13.2, 5.5][i],
    }));
    const mesesPorAno = { 2020: 12, 2021: 12, 2022: 12, 2023: 12, 2024: 12, 2025: 12, 2026: 8 };
    const d = montarDividendos({
      classe: 'fii',
      hoje: HOJE,
      anos,
      mesesPorAno,
      ult12m: 13.2,
      ult12mData: '2026-09-29',
    });
    expect(d.anos.map((a) => a.ano)).not.toContain(2026);
    expect(d.anos.at(-1)).toEqual({ ano: 2025, valor: 13.2 });
    expect(d.cagr5aPct).toBeCloseTo((Math.pow(13.2 / 11.03, 1 / 5) - 1) * 100, 6);
    expect(d.cagrMotivo).toBeNull();
    expect(d.selo).toBeNull();
    expect(d.unidade).toBe('rendimento');
  });

  it('FII: ano com menos de 12 informes sai da série', () => {
    const d = montarDividendos({
      classe: 'fii',
      hoje: HOJE,
      anos: [
        { ano: 2024, valor: 10 },
        { ano: 2025, valor: 11 },
      ],
      mesesPorAno: { 2024: 11, 2025: 12 },
      ult12m: null,
      ult12mData: null,
    });
    expect(d.anos.map((a) => a.ano)).toEqual([2025]);
    expect(d.cagrMotivo).toBe('histórico com menos de 5 anos');
  });

  it('flag de proventos em conferência no ano também marca', () => {
    const d = montarDividendos({
      classe: 'acao',
      hoje: HOJE,
      anos: [
        { ano: 2024, valor: 1 },
        { ano: 2025, valor: 1.1, flags: ['proventos_defasados_pagador_recorrente_parado'] },
      ],
      ult12m: null,
      ult12mData: null,
    });
    expect(d.anos[1].suspeito).toBe(true);
  });
});
