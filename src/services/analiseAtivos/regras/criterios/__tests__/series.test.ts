/**
 * Séries dos Filtros de Fundamentos com a fixture REAL do DEV (13/10/2026, exportada por
 * scripts/analise-ativos/exportar-fixtures-criterios.ts com as mesmas leituras do job 'criterios').
 * Confere as regras de série (FY vigente, FCL = FCO − CAPEX, desdobramento do FII, Obrigações/PL)
 * e o perfil (financeiras n de 3) de ponta a ponta com o motor puro.
 */
import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import {
  fysVigentesPorAno,
  seriesAcao,
  valoresAnoAcao,
  type BrutoAcao,
  type FyBrutoCriterios,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import {
  imoveisPlPctFii,
  mesesFii,
  seriesFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type { AvaliacaoAtivo, EstadoCriterio } from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/dev-2026-10-13.json';

const P = CRITERIA_PARAMS_V1;
const ANO_FIM = fixture.anoFim;
const SCORING = { sanidade: { proventos: fixture.proventosParams } } as unknown as ScoringParams;

type AcaoFixture = BrutoAcao & { symbols: string[] };
const ACOES = fixture.acoes as unknown as AcaoFixture[];
const FIIS = fixture.fiis as unknown as BrutoFii[];

function acao(symbol: string): AcaoFixture {
  const a = ACOES.find((x) => x.symbols.includes(symbol));
  if (!a) throw new Error(`${symbol} fora da fixture`);
  return a;
}
function fii(symbol: string): BrutoFii {
  const f = FIIS.find((x) => x.symbol === symbol);
  if (!f) throw new Error(`${symbol} fora da fixture`);
  return f;
}

function avaliarAcao(symbol: string): AvaliacaoAtivo {
  const a = acao(symbol);
  const perfil = perfilCriterios(
    { classe: 'acao', ehFinanceira: a.ehFinanceira, fiiTipo: null, imoveisPlPct: null },
    P,
  );
  return avaliarAtivo(
    { symbol, classe: 'acao', perfil, anoFim: ANO_FIM, series: seriesAcao(a), meses: null },
    P,
    1,
  );
}

function avaliarFii(symbol: string): AvaliacaoAtivo {
  const f = fii(symbol);
  const perfil = perfilCriterios(
    { classe: 'fii', ehFinanceira: false, fiiTipo: f.fiiTipo, imoveisPlPct: imoveisPlPctFii(f) },
    P,
  );
  return avaliarAtivo(
    {
      symbol,
      classe: 'fii',
      perfil,
      anoFim: ANO_FIM,
      series: seriesFii(f),
      meses: mesesFii(f, ANO_FIM, SCORING),
    },
    P,
    1,
  );
}

const estados = (a: AvaliacaoAtivo, janela: '3' | '5' | '10') =>
  Object.fromEntries(a.janelas[janela].resultados.map((r) => [r.id, r.estado])) as Record<
    string,
    EstadoCriterio
  >;
const fato = (a: AvaliacaoAtivo, janela: '3' | '5' | '10', id: string) =>
  a.janelas[janela].resultados.find((r) => r.id === id)?.fato;

describe('fixture do DEV', () => {
  it('âncora de 13/10/2026 = 2025, leitura desde 2015 (janela 10 + ano anterior)', () => {
    expect(fixture.hoje).toBe('2026-10-13');
    expect(ANO_FIM).toBe(2025);
    expect(fixture.desdeAno).toBe(2015);
  });
});

describe('seriesAcao (DFP/CVM)', () => {
  it('um FY vigente por ano: maior versão no escopo preferido', () => {
    const a = acao('WEGE3');
    const porAno = fysVigentesPorAno(a.fys, a.escopoPreferido);
    for (let ano = 2015; ano <= 2025; ano++) expect(porAno.has(ano), String(ano)).toBe(true);
    for (const f of porAno.values()) expect(f.escopo).toBe('con');
    // a regra pura: versão mais alta vence
    const v1 = { ...a.fys[0], versao: 1, receita: 1 } as FyBrutoCriterios;
    const v2 = { ...a.fys[0], versao: 2, receita: 2 } as FyBrutoCriterios;
    expect(fysVigentesPorAno([v2, v1], 'con').get(v1.anoFiscal)?.receita).toBe(2);
  });

  it('WEGE3: receita, EBITDA e FCL = FCO − CAPEX em R$ mi (nunca o campo fcf)', () => {
    const a = acao('WEGE3');
    const s = seriesAcao(a);
    expect(s.receita?.[2020]).toBeCloseTo(17469.557, 3);
    expect(s.receita?.[2025]).toBeCloseTo(40804.11, 2);
    expect(s.ebitda?.[2025]).toBeCloseTo(7998.741 + 1001.296, 3);
    const porAno = fysVigentesPorAno(a.fys, a.escopoPreferido);
    for (const ano of [2020, 2021, 2025]) {
      const f = porAno.get(ano)!;
      expect(s.fcl?.[ano]).toBeCloseTo((f.fco! - f.capex!) / 1e6, 6);
      // a leitura nem traz o campo fcf (fluxo de financiamento)
      expect('fcf' in f).toBe(false);
    }
    expect(s.fcl?.[2020]).toBeCloseTo(3371.486, 3);
    expect(s.fcl?.[2021]).toBeCloseTo(92.041, 3);
  });

  it('WEGE3: caixa líquido em todos os anos → Dív.líq/EBITDA "máx. 0,0×"; 5 de 6 na janela 5', () => {
    const a = avaliarAcao('WEGE3');
    expect(a.perfil).toBe('acao');
    expect(a.janelas['5']).toMatchObject({ atendidos: 5, aplicaveis: 6, anoInicio: 2021 });
    expect(fato(a, '5', 'rec')).toBe('cresceu em 5 de 5 anos · 17.470 → 40.804 (R$ mi)');
    expect(fato(a, '5', 'dl')).toBe('dentro do limite em 5 de 5 anos · máx. 0,0× (limite 3,0×)');
    expect(estados(a, '5').fcl).toBe('nao_atende');
    expect(fato(a, '5', 'fcl')).toBe('cresceu em 3 de 5 anos · 3.371 → 3.760 (R$ mi)');
  });

  it('PETR4 e AZUL3: não financeiras, n de 6', () => {
    for (const t of ['PETR4', 'AZUL3', 'TAEE11']) {
      const a = avaliarAcao(t);
      expect(a.perfil, t).toBe('acao');
      expect(a.janelas['5'].aplicaveis, t).toBe(6);
    }
    expect(fato(avaliarAcao('AZUL3'), '5', 'dl')).toBe(
      'dentro do limite em 0 de 5 anos · máx. 13,7× (limite 3,0×)',
    );
  });

  it('ITUB4, BBAS3, BBSE3 e ITSA4: acao_financeira (EBITDA, Dív/EBITDA e FCL não se aplicam)', () => {
    for (const t of ['ITUB4', 'BBAS3', 'BBSE3', 'ITSA4']) {
      const a = avaliarAcao(t);
      expect(a.perfil, t).toBe('acao_financeira');
      for (const j of ['3', '5', '10'] as const) {
        const e = estados(a, j);
        expect([e.ebitda, e.dl, e.fcl], t).toEqual([
          'nao_se_aplica',
          'nao_se_aplica',
          'nao_se_aplica',
        ]);
      }
    }
    // banco com receita comparável: margem avaliada, n de 3
    for (const j of ['3', '5', '10'] as const) {
      expect(avaliarAcao('BBAS3').janelas[j].aplicaveis, `BBAS3 j${j}`).toBe(3);
    }
    // bancos no escopo individual (decisão 3)
    expect(acao('ITUB4').escopoPreferido).toBe('ind');
    expect(acao('BBAS3').escopoPreferido).toBe('ind');
  });

  it('ITUB4, BBSE3 e ITSA4: margem não se aplica (receita não comparável ao lucro), n de 2', () => {
    for (const t of ['ITUB4', 'BBSE3', 'ITSA4']) {
      const a = avaliarAcao(t);
      for (const j of ['3', '5', '10'] as const) {
        expect(estados(a, j).mg, `${t} j${j}`).toBe('nao_se_aplica');
        expect(fato(a, j, 'mg'), t).toBe(TEXTOS_CRITERIOS.motivos.instituicao_financeira_mg);
        expect(a.janelas[j].aplicaveis, `${t} j${j}`).toBe(2);
      }
    }
  });

  it('ano com fundamentos_escala em conferência = ausente em todas as séries', () => {
    const a = acao('WEGE3');
    const s = seriesAcao({ ...a, flagsConf: ['conf:fundamentos_escala:salto_escala@2023'] });
    expect(s.receita?.[2023]).toBeNull();
    expect(s.fcl?.[2023]).toBeNull();
    expect(s.receita?.[2024]).not.toBeNull();
    // o grupo 'historico' (múltiplos) não mexe nos fundamentos
    const h = seriesAcao({ ...a, flagsConf: ['conf:historico:escala_ano@2023'] });
    expect(h.receita?.[2023]).not.toBeNull();
  });

  it('EBITDA ≤ 0: DL positiva = +Infinity (fora), caixa líquido = 0 (dentro)', () => {
    const base = fysVigentesPorAno(acao('WEGE3').fys, 'con').get(2025)!;
    const comDivida = valoresAnoAcao({
      ...base,
      ebit: -10,
      depreciacaoAmortizacao: 5,
      dividaBrutaCp: 100,
      dividaBrutaLp: 0,
      caixa: 10,
      aplicacoesFinanceiras: 0,
    });
    expect(comDivida.dlEbitda).toBe(Number.POSITIVE_INFINITY);
    const comCaixa = valoresAnoAcao({
      ...base,
      ebit: -10,
      depreciacaoAmortizacao: 5,
      dividaBrutaCp: 1,
      dividaBrutaLp: 0,
      caixa: 10,
      aplicacoesFinanceiras: 0,
    });
    expect(comCaixa.dlEbitda).toBe(0);
    expect(valoresAnoAcao({ ...base, receita: 0 }).margemLiquida).toBeNull();
  });

  it('receita ≤ 0 = sem dado (BBSE3: não vira "0 → 0"); receita ≤ lucro = margem sem dado (holding)', () => {
    const base = fysVigentesPorAno(acao('WEGE3').fys, 'con').get(2025)!;
    const zero = valoresAnoAcao({ ...base, receita: 0 });
    expect(zero.receita).toBeNull();
    expect(zero.margemLiquida).toBeNull();
    expect(valoresAnoAcao({ ...base, receita: 5e9, naoSeAplica: ['receita'] }).receita).toBeNull();
    // ITUB4 individual 2025: receita 30,68 bi e lucro 45,66 bi → margem de 148,8% não entra
    const holding = valoresAnoAcao({
      ...base,
      receita: 30_680_000_000,
      lucroLiquido: 45_659_000_000,
      lucroAtribuivel: 45_659_000_000,
    });
    expect(holding.receita).toBeCloseTo(30_680, 6);
    expect(holding.margemLiquida).toBeNull();
  });

  it('lucro atribuível com sinal oposto ao líquido (AZUL3 2023) = lucro e margem sem dado', () => {
    const base = fysVigentesPorAno(acao('WEGE3').fys, 'con').get(2025)!;
    const v = valoresAnoAcao({
      ...base,
      receita: 18_558_000_000,
      lucroLiquido: -2_380_456_000,
      lucroAtribuivel: 2_340_930_000,
    });
    expect(v.lucroLiquido).toBeNull();
    expect(v.margemLiquida).toBeNull();
  });
});

describe('seriesFii (informes CVM + proventos auditados)', () => {
  it('HGLG11 2017 levado à base de cotas de hoje (desdobramento 1:10 em abr/2018)', () => {
    const f = fii('HGLG11');
    expect(f.desdobramentos).toEqual([{ refMonth: '2018-04-01', fator: 10 }]);
    const bruto2017 = f.perShare.find((p) => p.anoFiscal === 2017)!;
    const s = seriesFii(f);
    expect(s.rendCota?.[2017]).toBeCloseTo((bruto2017.rendCota as number) / 10, 6);
    expect(s.vpCota?.[2017]).toBeCloseTo((bruto2017.vpCotaFim as number) / 10, 6);
    // anos depois do desdobramento ficam como estão
    const bruto2020 = f.perShare.find((p) => p.anoFiscal === 2020)!;
    expect(s.rendCota?.[2020]).toBeCloseTo(bruto2020.rendCota as number, 6);
  });

  it('HGLG11: tijolo; Obrigações/PL 20,2% em 2024 → não atende na janela 5', () => {
    const a = avaliarFii('HGLG11');
    expect(a.perfil).toBe('fii_tijolo');
    expect(fato(a, '5', 'alav')).toBe(
      'dentro do limite em 4 de 5 anos · máx. 20,2% (limite 20,0%)',
    );
    expect(estados(a, '5').alav).toBe('nao_atende');
    // D3: vacância sem dado para todos
    expect(estados(a, '5').vac).toBe('sem_dado');
    // janela 10: os informes CVM começam em 2016
    expect(estados(a, '10').rend).toBe('sem_dado');
  });

  it('resultado = soma dos 4 trimestres (R$ mi); ano incompleto = ausente', () => {
    const f = fii('HGLG11');
    const s = seriesFii(f);
    const tri2024 = f.trimestres.filter((t) => t.refQuarter.startsWith('2024'));
    expect(tri2024).toHaveLength(4);
    const soma = tri2024.reduce((acc, t) => acc + (t.resultadoTrimestral as number), 0) / 1e6;
    expect(s.resultadoFii?.[2024]).toBeCloseTo(soma, 6);
    const incompleto = seriesFii({ ...f, trimestres: tri2024.slice(0, 3) });
    expect(incompleto.resultadoFii?.[2024]).toBeNull();
  });

  it('XPLG11 tijolo; KNCR11 e MXRF11 papel (LTV e inadimplência sem dado, D3)', () => {
    expect(avaliarFii('XPLG11').perfil).toBe('fii_tijolo');
    for (const t of ['KNCR11', 'MXRF11']) {
      const a = avaliarFii(t);
      expect(a.perfil, t).toBe('fii_papel');
      expect(estados(a, '5').inad, t).toBe('sem_dado');
      expect(estados(a, '5').ltv, t).toBe('sem_dado');
    }
  });

  it('meses ancorados em dez/2025: HGLG11 60 de 60 na janela 5', () => {
    expect(fato(avaliarFii('HGLG11'), '5', 'mes')).toBe(
      '60 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    );
  });

  it('ticker↔CNPJ não conferido: só o rendimento por cota (proventos B3) continua', () => {
    const f = fii('HGLG11');
    const s = seriesFii({ ...f, conferido: false });
    expect(Object.values(s.vpCota ?? {}).every((v) => v === null)).toBe(true);
    expect(Object.values(s.obrigacoesPl ?? {}).every((v) => v === null)).toBe(true);
    expect(Object.keys(s.resultadoFii ?? {})).toHaveLength(0);
    expect(s.rendCota?.[2024]).not.toBeNull();
    expect(imoveisPlPctFii({ ...f, conferido: false })).toBeNull();
  });

  it('ano com a base por cota quebrada (decisão 1) = rendimento e VP/cota ausentes', () => {
    const f = fii('XPLG11');
    const perShare = f.perShare.map((p) =>
      p.anoFiscal === 2023 ? { ...p, flags: [...p.flags, 'salto_acoes_sem_evento'] } : p,
    );
    const s = seriesFii({ ...f, perShare });
    expect(s.rendCota?.[2023]).toBeNull();
    expect(s.vpCota?.[2023]).toBeNull();
    expect(s.rendCota?.[2024]).not.toBeNull();
  });
});
