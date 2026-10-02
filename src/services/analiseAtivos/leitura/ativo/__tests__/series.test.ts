import { describe, it, expect } from 'vitest';
import {
  anosFechados,
  baseCem,
  cagr,
  cagrJanela,
  detectarSaltoProvento,
  fatorAjusteAte,
  pontoUlt12m,
} from '../series';

// Números do banco dev (29/09/2026).
const WEGE3_DPA = [
  { ano: 2019, valor: 0.1702 },
  { ano: 2020, valor: 0.2172 },
  { ano: 2021, valor: 0.4399 },
  { ano: 2022, valor: 0.5157 },
  { ano: 2023, valor: 0.6148 },
  { ano: 2024, valor: 0.7558 },
  { ano: 2025, valor: 2.4506 },
];
const HGLG11_REND = [
  { ano: 2023, valor: 13.6 },
  { ano: 2024, valor: 13.2 },
  { ano: 2025, valor: 13.2 },
  { ano: 2026, valor: 5.5 },
];

describe('cagr', () => {
  it('calcula % a.a.', () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(10, 6);
  });
  it('null com base ≤ 0, fim ≤ 0, ausente ou anos inválidos', () => {
    expect(cagr(0, 10, 5)).toBeNull();
    expect(cagr(-1, 10, 5)).toBeNull();
    expect(cagr(10, 0, 5)).toBeNull();
    expect(cagr(null, 10, 5)).toBeNull();
    expect(cagr(10, 20, 0)).toBeNull();
    expect(cagr(Number.NaN, 20, 2)).toBeNull();
  });
});

describe('anosFechados', () => {
  it('descarta o ano corrente (HGLG11 2026 = 5,5 contra 13,2)', () => {
    const r = anosFechados(HGLG11_REND, '2026-10-02');
    expect(r.map((p) => p.ano)).toEqual([2023, 2024, 2025]);
  });
  it('FII: descarta ano com menos de 12 meses de informe', () => {
    const r = anosFechados(HGLG11_REND, '2026-10-02', {
      mesesPorAno: { 2023: 12, 2024: 11, 2025: 12 },
    });
    expect(r.map((p) => p.ano)).toEqual([2023, 2025]);
  });
  it('ordena por ano', () => {
    expect(anosFechados([{ ano: 2024 }, { ano: 2020 }], '2026-01-01').map((p) => p.ano)).toEqual([
      2020, 2024,
    ]);
  });
});

describe('pontoUlt12m', () => {
  it('separa o ponto últ. 12m', () => {
    expect(pontoUlt12m(3.1, '2026-09-29')).toEqual({ valor: 3.1, dataRef: '2026-09-29' });
    expect(pontoUlt12m(null, '2026-09-29')).toBeNull();
    expect(pontoUlt12m(1, null)).toBeNull();
  });
});

// payout ≈ DPA ÷ LPA ajustados (dev): 2021 ≈ 51%, 2025 ≈ 161%
const WEGE3_PAYOUT = { 2019: 44, 2020: 39, 2021: 51, 2022: 51, 2023: 45, 2024: 52, 2025: 161 };

describe('detectarSaltoProvento', () => {
  it('marca WEGE3 2025 (2,45 contra 0,76) e não 2021 (dobrou com lucro)', () => {
    const r = detectarSaltoProvento(WEGE3_DPA, { payoutPorAno: WEGE3_PAYOUT });
    expect(r.anosSuspeitos).toEqual([2025]);
    expect(r.serie.find((p) => p.ano === 2025)?.suspeito).toBe(true);
    expect(r.serie.find((p) => p.ano === 2024)?.suspeito).toBeUndefined();
  });
  it('sem payout vale só o salto (> 2× o ano anterior)', () => {
    const r = detectarSaltoProvento(WEGE3_DPA);
    expect(r.anosSuspeitos).toEqual([2021, 2025]);
    expect(
      detectarSaltoProvento([
        { ano: 1, valor: 1 },
        { ano: 2, valor: 2 },
      ]).anosSuspeitos,
    ).toEqual([]);
    expect(
      detectarSaltoProvento([
        { ano: 1, valor: 1 },
        { ano: 2, valor: 2.01 },
      ]).anosSuspeitos,
    ).toEqual([2]);
  });
  it('compara com o ano anterior imediato (sem cascata)', () => {
    const r = detectarSaltoProvento([
      { ano: 1, valor: 1 },
      { ano: 2, valor: 5 },
      { ano: 3, valor: 2.5 },
    ]);
    expect(r.anosSuspeitos).toEqual([2]);
  });
  it('payout informado acima de 150% confirma o salto', () => {
    const r = detectarSaltoProvento(
      [
        { ano: 1, valor: 1 },
        { ano: 2, valor: 3 },
      ],
      { payoutPorAno: { 2: 180 } },
    );
    expect(r.anosSuspeitos).toEqual([2]);
  });
  it('ano sem valor não quebra a referência', () => {
    const r = detectarSaltoProvento([
      { ano: 1, valor: 1 },
      { ano: 2, valor: null },
      { ano: 3, valor: 1.5 },
    ]);
    expect(r.anosSuspeitos).toEqual([]);
  });
});

describe('detectarSaltoProvento com payout não positivo', () => {
  it('salto > 2× em ano de prejuízo (payout negativo) fica em conferência (AURE3 2023)', () => {
    const r = detectarSaltoProvento(
      [
        { ano: 2022, valor: 0.186 },
        { ano: 2023, valor: 3 },
      ],
      { payoutPorAno: { 2022: 40, 2023: -120 } },
    );
    expect(r.anosSuspeitos).toEqual([2023]);
  });
});

describe('cagrJanela', () => {
  it('extremo suspeito fica fora (WEGE3 2025)', () => {
    const { serie } = detectarSaltoProvento(WEGE3_DPA, { payoutPorAno: WEGE3_PAYOUT });
    const r = cagrJanela(serie, 5);
    expect(r.pct).toBeNull();
    expect(r.motivo).toBe('extremo_em_conferencia');
  });
  it('recuarFimEmConferencia: último ano suspeito ⇒ janela de 2019 a 2024', () => {
    const { serie } = detectarSaltoProvento(WEGE3_DPA, { payoutPorAno: WEGE3_PAYOUT });
    const r = cagrJanela(serie, 5, { recuarFimEmConferencia: true });
    expect([r.anoInicio, r.anoFim]).toEqual([2019, 2024]);
    expect(r.pct).toBeCloseTo(cagr(0.1702, 0.7558, 5)!, 6);
  });
  it('sem o ano suspeito calcula de 2019 a 2024', () => {
    const r = cagrJanela(
      WEGE3_DPA.filter((p) => p.ano < 2025),
      5,
    );
    expect(r.anoInicio).toBe(2019);
    expect(r.anoFim).toBe(2024);
    expect(r.pct).toBeCloseTo(cagr(0.1702, 0.7558, 5)!, 6);
  });
  it('histórico curto e base ≤ 0', () => {
    expect(cagrJanela([{ ano: 2024, valor: 1 }], 5).motivo).toBe('historico_curto');
    expect(
      cagrJanela(
        [
          { ano: 2019, valor: -1 },
          { ano: 2024, valor: 1 },
        ],
        5,
      ).motivo,
    ).toBe('base_nao_positiva');
  });
});

describe('baseCem', () => {
  it('rebase no primeiro ponto > 0 a partir do início', () => {
    const r = baseCem(
      [
        { chave: 'a', valor: 50 },
        { chave: 'b', valor: 100 },
        { chave: 'c', valor: null },
        { chave: 'd', valor: 150 },
      ],
      1,
    );
    expect(r.map((p) => p.base100)).toEqual([null, 100, null, 150]);
  });
  it('pula base não positiva', () => {
    const r = baseCem([{ valor: -2 }, { valor: 4 }, { valor: 2 }]);
    expect(r.map((p) => p.base100)).toEqual([null, 100, 50]);
  });
});

describe('fatorAjusteAte', () => {
  const eventos = [
    { dataEvento: '2021-04-20', fator: 2, status: 'confirmado' as const },
    { dataEvento: '2023-01-10', fator: 3, status: 'descartado' as const },
  ];
  it('desdobramento confirmado posterior ajusta; descartado não', () => {
    expect(fatorAjusteAte('2020-12-31', eventos)).toBe(2);
    expect(fatorAjusteAte('2021-04-20', eventos)).toBe(1);
    expect(fatorAjusteAte('2022-12-31', eventos)).toBe(1);
  });
});
