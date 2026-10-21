/**
 * fundamentei-regras (F2, A4.c): job quadro com o exercício fora de dezembro (CAML3 SINTÉTICO, mar–
 * fev). Com a scoring v1/v2 ('ano'), o FY 2026 (mar/25–fev/26) fica fora até 2027; com a v3
 * (serie10aPorDtFim) ele entra no 'lucro 10 anos' e no salto de provento. Dezembro não muda.
 */
import { describe, expect, it } from 'vitest';
import { montarLinhasQuadro, type EntradaQuadro } from '../montarLinhasQuadro';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';

const DATA_REF = new Date('2026-10-19T00:00:00.000Z');

function entrada(): EntradaQuadro {
  const acoes = [
    {
      symbol: 'CAML3',
      cnpj: 'C-CAM',
      classeTitulo: 'ON' as const,
      unitQtdOn: null,
      unitQtdPn: null,
    },
    {
      symbol: 'DEZM3',
      cnpj: 'C-DEZ',
      classeTitulo: 'ON' as const,
      unitQtdOn: null,
      unitQtdPn: null,
    },
  ];
  return {
    hoje: '2026-10-20',
    dataRef: DATA_REF,
    geradoEm: new Date('2026-10-20T10:40:00.000Z'),
    acoes,
    fiis: [],
    scores: [],
    multiplos: acoes.map((a) => ({
      symbol: a.symbol,
      preco: 10,
      precoData: DATA_REF,
      lpaTtm: 1,
      rend12m: null,
      pl: 10,
      pvp: 1.5,
      dy12mPct: 5,
      payoutPct: 50,
      margemLiquidaPct: 12,
      roePct: 15,
      divLiqEbitda: 1,
      divLiqPl: 0.5,
      obrigacoesPlPct: null,
      anosLucroConsecutivos: 3,
      mesesComRendimento: null,
      naoSeAplica: [],
      flags: [],
    })),
    resumos: acoes.map((a) => ({
      symbol: a.symbol,
      ultimoPregao: DATA_REF,
      closeRaw: 10,
      volumeMedio21: 1_000_000,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    })),
    setores: [],
    nomesCia: [],
    nomesFii: [],
    assets: [],
    fiiMensal: [],
    fiiTrimestral: [],
    ultimosPregoes: [],
    porAcaoAno: [
      // CAML3 (sintético): FY 2026 = mar/25–fev/26 com DPA 3× o anterior, sem payout informado
      {
        symbol: 'CAML3',
        anoFiscal: 2024,
        dpaAjHoje: 0.2,
        payoutDmplPct: null,
        dtFim: '2024-02-29',
      },
      {
        symbol: 'CAML3',
        anoFiscal: 2025,
        dpaAjHoje: 0.2,
        payoutDmplPct: null,
        dtFim: '2025-02-28',
      },
      {
        symbol: 'CAML3',
        anoFiscal: 2026,
        dpaAjHoje: 0.6,
        payoutDmplPct: null,
        dtFim: '2026-02-28',
      },
      // dezembro: 2026 é o ano corrente e fica fora nos dois modos
      { symbol: 'DEZM3', anoFiscal: 2025, dpaAjHoje: 1, payoutDmplPct: null, dtFim: '2025-12-31' },
      { symbol: 'DEZM3', anoFiscal: 2026, dpaAjHoje: 5, payoutDmplPct: null, dtFim: '2026-12-31' },
    ],
    lucrosFy: [
      { cnpj: 'C-CAM', anoFiscal: 2024, lucro: 1e8, dtFim: '2024-02-29' },
      { cnpj: 'C-CAM', anoFiscal: 2025, lucro: 2e8, dtFim: '2025-02-28' },
      { cnpj: 'C-CAM', anoFiscal: 2026, lucro: 3e8, dtFim: '2026-02-28' },
      { cnpj: 'C-DEZ', anoFiscal: 2025, lucro: 4e8, dtFim: '2025-12-31' },
      { cnpj: 'C-DEZ', anoFiscal: 2026, lucro: 5e8, dtFim: '2026-12-31' },
    ],
    mesesInformeFii: [],
    contagens: [],
  };
}

const linha = (r: ReturnType<typeof montarLinhasQuadro>, s: string) =>
  r.linhas.find((l) => l.symbol === s)!;

describe('montarLinhasQuadro — exercício fora de dezembro (serie10aPorDtFim)', () => {
  it.each([
    ['v1', SCORING_PARAMS_V1],
    ['v2', SCORING_PARAMS_V2],
  ])("%s ('ano', hoje): o FY de fev/2026 fica fora do lucro 10 anos e do salto", (_n, p) => {
    const r = montarLinhasQuadro(entrada(), p);
    expect(linha(r, 'CAML3').serie10a).toEqual([
      { ano: 2024, valor: 1e8 },
      { ano: 2025, valor: 2e8 },
    ]);
    expect(linha(r, 'CAML3').flags).not.toContain('provento_suspeito');
  });

  it("v3 ('dtFim'): o FY de fev/2026 entra; o salto de provento dele vira provento_suspeito", () => {
    const r = montarLinhasQuadro(entrada(), SCORING_PARAMS_V3);
    expect(linha(r, 'CAML3').serie10a).toEqual([
      { ano: 2024, valor: 1e8 },
      { ano: 2025, valor: 2e8 },
      { ano: 2026, valor: 3e8 },
    ]);
    expect(linha(r, 'CAML3').flags).toContain('provento_suspeito');
  });

  it('dezembro não muda: v2 e v3 iguais', () => {
    const a = linha(montarLinhasQuadro(entrada(), SCORING_PARAMS_V2), 'DEZM3');
    const b = linha(montarLinhasQuadro(entrada(), SCORING_PARAMS_V3), 'DEZM3');
    expect(b.serie10a).toEqual(a.serie10a);
    expect(b.serie10a).toEqual([{ ano: 2025, valor: 4e8 }]);
    expect(b.flags).toEqual(a.flags);
  });

  it('sem dtFim nas entradas (chamada antiga): a v3 cai na regra do ano', () => {
    const e = entrada();
    e.lucrosFy = e.lucrosFy.map(({ dtFim: _d, ...x }) => x);
    e.porAcaoAno = e.porAcaoAno.map(({ dtFim: _d, ...x }) => x);
    const r = montarLinhasQuadro(e, SCORING_PARAMS_V3);
    expect(linha(r, 'CAML3').serie10a).toHaveLength(2);
  });
});
