import { describe, it, expect } from 'vitest';
import {
  colunasLegadasPorSimbolo,
  GRUPOS_QUE_TIRAM_DY,
  reguaLegadaDoFii,
} from '../colunasLegadasQuadro';
import type { EntradaQuadro, MultiplosQuadro } from '../montarLinhasQuadro';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';
import { SCORING_PARAMS_V4 } from '@/services/analiseAtivos/params/scoringParamsV4';
import {
  DEF_GRUPO,
  GRUPOS_CONFERENCIA,
  formatarFlagConf,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

const DATA_REF = new Date('2026-10-22T00:00:00.000Z');
const P = SCORING_PARAMS_V4;

function mult(symbol: string, over: Partial<MultiplosQuadro> = {}): MultiplosQuadro {
  return {
    symbol,
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
    anosLucroConsecutivos: 10,
    mesesComRendimento: null,
    naoSeAplica: [],
    flags: [],
    paramsVersion: 4,
    ...over,
  };
}

const resumo = (symbol: string, volumeMedio21 = 1_000_000) => ({
  symbol,
  ultimoPregao: DATA_REF,
  closeRaw: 10,
  volumeMedio21,
  baixaLiquidez: false,
  negociadoUltimos30: true,
});

const acao = (symbol: string, cnpj: string) => ({
  symbol,
  cnpj,
  classeTitulo: (symbol.endsWith('3') ? 'ON' : 'PN') as 'ON' | 'PN',
  unitQtdOn: null,
  unitQtdPn: null,
});

function entrada(over: Partial<EntradaQuadro> = {}): EntradaQuadro {
  return {
    hoje: '2026-10-23',
    dataRef: DATA_REF,
    geradoEm: DATA_REF,
    acoes: [],
    fiis: [],
    emissores: [],
    multiplos: [],
    resumos: [],
    setores: [],
    nomesCia: [],
    nomesFii: [],
    assets: [],
    fiiMensal: [],
    fiiTrimestral: [],
    ultimosPregoes: [],
    porAcaoAno: [],
    lucrosFy: [],
    mesesInformeFii: [],
    contagens: [],
    ...over,
  };
}

const PRECO_BASE = formatarFlagConf({
  grupo: 'preco_base',
  regra: 'base_sem_evento',
  chave: '2026-10-01',
});
const PRECO_ESPORADICO = formatarFlagConf({
  grupo: 'preco_esporadico',
  regra: 'faixa_pvp',
  chave: '2026-10',
});

/** COELBA: CEEB3 (ON, maior volume = referência) e CEEB5 (PN ilíquida). */
function coelba(flagsOn: string[], flagsPn: string[], overOn: Partial<MultiplosQuadro> = {}) {
  return entrada({
    acoes: [acao('CEEB3', 'C-CEE'), acao('CEEB5', 'C-CEE')],
    resumos: [resumo('CEEB3', 50_000), resumo('CEEB5', 1_000)],
    multiplos: [mult('CEEB3', { flags: flagsOn, ...overOn }), mult('CEEB5', { flags: flagsPn })],
  });
}

describe('GRUPOS_QUE_TIRAM_DY', () => {
  it('= os grupos de DEF_GRUPO (fora o legado de proventos) que marcam o DY e valem para a classe', () => {
    for (const classe of ['acao', 'fii'] as const) {
      const doContrato = GRUPOS_CONFERENCIA.filter(
        (g) =>
          g !== 'proventos' &&
          DEF_GRUPO[g].classes.includes(classe) &&
          DEF_GRUPO[g].campos.dy12m !== undefined,
      );
      expect([...doContrato].sort()).toEqual([...GRUPOS_QUE_TIRAM_DY].sort());
    }
    // escopo ticker: só a referência contamina o Índice da empresa
    for (const g of GRUPOS_QUE_TIRAM_DY) expect(DEF_GRUPO[g].escopo).toBe('ticker');
  });

  it('o componente de DY está ativo com a métrica dy12mPct em todas as versões', () => {
    const versoes: ScoringParams[] = [
      SCORING_PARAMS_V1,
      SCORING_PARAMS_V2,
      SCORING_PARAMS_V3,
      SCORING_PARAMS_V4,
    ];
    for (const p of versoes) {
      for (const div of [
        p.acao.componentes.div,
        p.fii.tijolo.componentes.div,
        p.fii.papel.componentes.div,
      ]) {
        expect(div.metrica).toBe('dy12mPct');
        expect(div.ativo).not.toBe(false);
      }
    }
  });
});

describe('colunasLegadasPorSimbolo — ações', () => {
  it('CEEB3/CEEB5: DY em conferência numa PN contamina a ON de referência (e volta para todos)', () => {
    const m = colunasLegadasPorSimbolo(coelba([], ['proventos_em_conferencia_dy_acima_teto']), P);
    for (const s of ['CEEB3', 'CEEB5']) {
      expect(m.get(s)).toMatchObject({
        temScoreLegado: true,
        regua: 'acao',
        tickerReferencia: 'CEEB3',
        motivosIncompleto: ['div:em_conferencia'],
        paramsVersion: 4,
      });
    }
  });

  it('referência = maior volume com resumo; empate pelo symbol', () => {
    const e = entrada({
      acoes: [acao('BBBB4', 'C-B'), acao('BBBB3', 'C-B')],
      resumos: [resumo('BBBB4'), resumo('BBBB3')],
      multiplos: [mult('BBBB4'), mult('BBBB3')],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('BBBB4')?.tickerReferencia).toBe('BBBB3');
  });

  it('conf:preco_base na referência tira o DY; na PN, não', () => {
    const naRef = colunasLegadasPorSimbolo(coelba([PRECO_BASE], []), P);
    expect(naRef.get('CEEB5')?.motivosIncompleto).toEqual(['div:em_conferencia']);
    const naPn = colunasLegadasPorSimbolo(coelba([], [PRECO_BASE]), P);
    expect(naPn.get('CEEB3')?.motivosIncompleto).toEqual([]);
    expect(naPn.get('CEEB5')?.motivosIncompleto).toEqual([]);
  });

  it('conf:preco_base na referência vale também com o DY ausente (fonte defasada)', () => {
    const m = colunasLegadasPorSimbolo(
      coelba([PRECO_BASE, 'proventos_defasados_base_parada'], [], { dy12mPct: null }),
      P,
    );
    expect(m.get('CEEB3')?.motivosIncompleto).toEqual(['div:em_conferencia']);
  });

  it('proventos_defasados só na referência: a PN também recebe div:fonte_defasada', () => {
    const m = colunasLegadasPorSimbolo(
      coelba(['proventos_defasados_cobertura_antiga'], [], { dy12mPct: null }),
      P,
    );
    expect(m.get('CEEB5')?.motivosIncompleto).toEqual(['div:fonte_defasada']);
    // defasada só na PN: a referência manda
    const soPn = colunasLegadasPorSimbolo(coelba([], ['proventos_defasados_cobertura_antiga']), P);
    expect(soPn.get('CEEB3')?.motivosIncompleto).toEqual([]);
  });

  it('DY ausente sem defasagem nem conferência: nenhum código legado', () => {
    const m = colunasLegadasPorSimbolo(coelba([], [], { dy12mPct: null }), P);
    expect(m.get('CEEB3')?.motivosIncompleto).toEqual([]);
  });

  it('DY n/a: nenhum código, mesmo com conferência', () => {
    const m = colunasLegadasPorSimbolo(
      coelba([PRECO_BASE], ['proventos_em_conferencia_salto_recente'], {
        dy12mPct: null,
        naoSeAplica: ['dy12mPct'],
      }),
      P,
    );
    expect(m.get('CEEB3')?.motivosIncompleto).toEqual([]);
  });

  it('conferência de outro grupo (acoes_escala) não tira o DY', () => {
    const flag = formatarFlagConf({
      grupo: 'acoes_escala',
      regra: 'pl_minimo',
      chave: '2026-06-30',
    });
    const m = colunasLegadasPorSimbolo(coelba([flag], []), P);
    expect(m.get('CEEB3')?.motivosIncompleto).toEqual([]);
  });

  it('ticker sem resumo herda as colunas da empresa; empresa sem resumo fica sem score', () => {
    const e = entrada({
      acoes: [acao('KLBN4', 'C-KLA'), { ...acao('KLBN11', 'C-KLA'), classeTitulo: 'UNIT' }],
      resumos: [resumo('KLBN4')],
      multiplos: [mult('KLBN4', { flags: ['proventos_em_conferencia_salto_recente'] })],
    });
    const m = colunasLegadasPorSimbolo(e, P);
    expect(m.get('KLBN11')).toEqual(m.get('KLBN4'));
    expect(m.get('KLBN11')).toMatchObject({
      tickerReferencia: 'KLBN4',
      motivosIncompleto: ['div:em_conferencia'],
      paramsVersion: 4,
    });
    const sem = colunasLegadasPorSimbolo(entrada({ acoes: [acao('XXXX3', 'C-X')] }), P);
    expect(sem.get('XXXX3')).toEqual({
      temScoreLegado: false,
      regua: null,
      tickerReferencia: null,
      motivosIncompleto: [],
      componentesZeroRegra: [],
      paramsVersion: null,
    });
  });

  it('financeira pelo emissor: régua acao_financeira', () => {
    const e = entrada({
      acoes: [acao('ITUB4', 'C-ITA')],
      emissores: [{ cnpj: 'C-ITA', ehFinanceira: true }],
      resumos: [resumo('ITUB4')],
      multiplos: [mult('ITUB4')],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('ITUB4')?.regua).toBe('acao_financeira');
  });

  it('prejuízo no último FY ⇒ lucro:prejuizo e preco:prejuizo; controladora_zero não usa o individual', () => {
    const base = {
      acoes: [acao('AURE3', 'C-AUR')],
      resumos: [resumo('AURE3')],
      multiplos: [mult('AURE3')],
    };
    const prejuizo = colunasLegadasPorSimbolo(
      entrada({
        ...base,
        lucrosFy: [
          { cnpj: 'C-AUR', anoFiscal: 2024, lucro: 5e8, lucroSemIndividual: 5e8 },
          { cnpj: 'C-AUR', anoFiscal: 2025, lucro: -6.6e8, lucroSemIndividual: -6.6e8 },
        ],
      }),
      P,
    );
    expect(prejuizo.get('AURE3')?.componentesZeroRegra).toEqual([
      'lucro:prejuizo',
      'preco:prejuizo',
    ]);
    // lucro só do individual (controladora_zero) com prejuízo: o último FY é ausente, sem zero-regra
    const controladoraZero = colunasLegadasPorSimbolo(
      entrada({
        ...base,
        lucrosFy: [{ cnpj: 'C-AUR', anoFiscal: 2025, lucro: -1e6, lucroSemIndividual: null }],
      }),
      P,
    );
    expect(controladoraZero.get('AURE3')?.componentesZeroRegra).toEqual([]);
    // prejuízo antigo não conta
    const antigo = colunasLegadasPorSimbolo(
      entrada({
        ...base,
        lucrosFy: [
          { cnpj: 'C-AUR', anoFiscal: 2024, lucro: -5e8, lucroSemIndividual: -5e8 },
          { cnpj: 'C-AUR', anoFiscal: 2025, lucro: 1e8, lucroSemIndividual: 1e8 },
        ],
      }),
      P,
    );
    expect(antigo.get('AURE3')?.componentesZeroRegra).toEqual([]);
  });
});

describe('colunasLegadasPorSimbolo — FIIs', () => {
  const mensal = (cnpj: string, over: Partial<EntradaQuadro['fiiMensal'][number]> = {}) => ({
    cnpj,
    segmentoCvm: 'Títulos e Val. Mob.',
    tipoVigente: 'papel',
    reguaVigente: 'fii_papel',
    cotistas: 10,
    pl: 1e9,
    cotas: 1e7,
    ...over,
  });

  it('FII de papel com conf:preco_esporadico: régua do informe e DY em conferência', () => {
    const e = entrada({
      fiis: [{ symbol: 'MXRF11', cnpj: 'F-MXR' }],
      resumos: [resumo('MXRF11')],
      multiplos: [mult('MXRF11', { flags: [PRECO_ESPORADICO], paramsVersion: 4 })],
      fiiMensal: [mensal('F-MXR')],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('MXRF11')).toEqual({
      temScoreLegado: true,
      regua: 'fii_papel',
      tickerReferencia: null,
      fiiTipo: 'papel',
      motivosIncompleto: ['div:em_conferencia'],
      componentesZeroRegra: [],
      paramsVersion: 4,
    });
  });

  it('FII com a própria base defasada: div:fonte_defasada', () => {
    const e = entrada({
      fiis: [{ symbol: 'KNCR11', cnpj: 'F-KNC' }],
      resumos: [resumo('KNCR11')],
      multiplos: [
        mult('KNCR11', { dy12mPct: null, flags: ['proventos_defasados_cobertura_antiga'] }),
      ],
      fiiMensal: [mensal('F-KNC')],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('KNCR11')?.motivosIncompleto).toEqual([
      'div:fonte_defasada',
    ]);
  });

  it('FoF e PL <= 0: régua fora do Índice e nenhum motivo', () => {
    const flags = [PRECO_BASE, 'proventos_em_conferencia_dy_acima_teto'];
    const e = entrada({
      fiis: [
        { symbol: 'HFOF11', cnpj: 'F-HFO' },
        { symbol: 'NEGA11', cnpj: 'F-NEG' },
      ],
      resumos: [resumo('HFOF11'), resumo('NEGA11')],
      multiplos: [mult('HFOF11', { flags }), mult('NEGA11', { flags })],
      fiiMensal: [
        mensal('F-HFO', { tipoVigente: 'fof', reguaVigente: 'fora_do_indice' }),
        mensal('F-NEG', { tipoVigente: 'tijolo', reguaVigente: 'fii_tijolo', pl: -1 }),
      ],
    });
    const m = colunasLegadasPorSimbolo(e, P);
    expect(m.get('HFOF11')).toMatchObject({
      regua: 'fora_do_indice',
      fiiTipo: 'fof',
      motivosIncompleto: [],
    });
    expect(m.get('NEGA11')).toMatchObject({
      regua: 'fora_do_indice',
      fiiTipo: 'tijolo',
      motivosIncompleto: [],
    });
  });

  it('FII sem informe: régua indefinido.regua dos params, tipo nulo', () => {
    const e = entrada({
      fiis: [{ symbol: 'NOVO11', cnpj: 'F-NOV' }],
      resumos: [resumo('NOVO11')],
      multiplos: [mult('NOVO11', { flags: ['proventos_em_conferencia_salto_recente'] })],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('NOVO11')).toMatchObject({
      temScoreLegado: true,
      regua: P.fii.indefinido.regua,
      fiiTipo: null,
      motivosIncompleto: ['div:em_conferencia'],
    });
  });

  it('FII não conferido (exigirTickerConferido): sem score — régua, versão e tipo de fora', () => {
    const e = entrada({
      fiis: [{ symbol: 'PLTB11', cnpj: 'F-PLT', conferido: false }],
      resumos: [resumo('PLTB11')],
      multiplos: [mult('PLTB11')],
      fiiMensal: [mensal('F-PLT')],
    });
    const c = colunasLegadasPorSimbolo(e, P).get('PLTB11');
    expect(c).toMatchObject({ temScoreLegado: false, regua: null, paramsVersion: null });
    // sem fiiTipo: o montarLinhasQuadro usa o informe mascarado (nulo)
    expect(c?.fiiTipo).toBeUndefined();
    // com exigirTickerConferido=false, o não conferido entra com o informe SEM máscara
    const solto = structuredClone(P);
    solto.fii.exigirTickerConferido = false;
    expect(colunasLegadasPorSimbolo(e, solto).get('PLTB11')).toMatchObject({
      temScoreLegado: true,
      regua: 'fii_papel',
      fiiTipo: 'papel',
    });
  });

  it('FII sem resumo: sem score', () => {
    const e = entrada({
      fiis: [{ symbol: 'PARA11', cnpj: 'F-PAR' }],
      fiiMensal: [mensal('F-PAR')],
    });
    expect(colunasLegadasPorSimbolo(e, P).get('PARA11')?.temScoreLegado).toBe(false);
  });

  it('reguaLegadaDoFii: régua tijolo/papel do informe; sem régua ⇒ indefinido', () => {
    expect(reguaLegadaDoFii(mensal('X', { reguaVigente: 'fii_tijolo' }), P)).toBe('fii_tijolo');
    expect(reguaLegadaDoFii(mensal('X', { reguaVigente: null, tipoVigente: 'hibrido' }), P)).toBe(
      P.fii.indefinido.regua,
    );
    expect(reguaLegadaDoFii(undefined, P)).toBe(P.fii.indefinido.regua);
  });
});
