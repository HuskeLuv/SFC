import { describe, expect, it } from 'vitest';
import {
  detectarCriterios,
  detectarFiiTrimestral,
  detectarProventos,
  detectarResultados,
  lerMarcoCriterios,
  lerMarcoFiiTrimestral,
  type AvaliacaoCriterios5,
  type EventoResultadoBruto,
  type LinhaProventoAlerta,
  type MarcoCriterios,
  type RelogioAlertas,
} from '../detectores';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';

// sexta 16/10/2026, 11:10 UTC (a rodada do job)
const AGORA = Date.parse('2026-10-16T11:10:00Z');
const R: RelogioAlertas = { hoje: '2026-10-16', agoraMs: AGORA };
const ha = (dias: number) => new Date(AGORA - dias * 86_400_000).toISOString();

describe('detectarResultados', () => {
  const cnpjs = new Map([
    ['33000167000101', ['PETR4', 'PETR3']],
    ['84429695000111', ['WEGE3']],
  ]);
  const ev = (over: Partial<EventoResultadoBruto> = {}): EventoResultadoBruto => ({
    id: 'e1',
    cnpj: '84429695000111',
    tipo: 'resultado',
    periodoRef: '2026-3T',
    data: '2026-10-15',
    estimado: false,
    fetchedAt: ha(0.5),
    ...over,
  });

  it('entrega real e recente avisa uma vez, com a chave do evento', () => {
    const f = detectarResultados([ev()], cnpjs, R);
    expect(f).toEqual([
      expect.objectContaining({
        chave: 'evento:e1',
        tickers: ['WEGE3'],
        periodoRef: '2026-3T',
        data: '2026-10-15',
      }),
    ]);
  });

  it('estimado não avisa', () => {
    expect(detectarResultados([ev({ estimado: true })], cnpjs, R)).toEqual([]);
    expect(detectarResultados([ev({ tipo: 'resultado_estimado' })], cnpjs, R)).toEqual([]);
  });

  it('entrega antiga com fetchedAt novo (reprocesso do cvm-ipe) não avisa', () => {
    expect(detectarResultados([ev({ data: '2026-08-10', fetchedAt: ha(0.1) })], cnpjs, R)).toEqual(
      [],
    );
    // limite: hoje − 7 ainda entra; hoje − 8 não
    expect(detectarResultados([ev({ data: '2026-10-09' })], cnpjs, R)).toHaveLength(1);
    expect(detectarResultados([ev({ data: '2026-10-08' })], cnpjs, R)).toEqual([]);
  });

  it('fetchedAt de mais de 3 dias não avisa (rodadas anteriores já viram)', () => {
    expect(detectarResultados([ev({ fetchedAt: ha(3.5) })], cnpjs, R)).toEqual([]);
  });

  it('PETR3 + PETR4 = 1 fato por companhia (o mais novo), tickers em ordem', () => {
    const f = detectarResultados(
      [
        ev({ id: 'a', cnpj: '33000167000101', data: '2026-10-12' }),
        ev({ id: 'b', cnpj: '33000167000101', data: '2026-10-14' }),
      ],
      cnpjs,
      R,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ chave: 'evento:b', tickers: ['PETR3', 'PETR4'] });
  });

  it('CNPJ sem ticker no Quadro fica de fora', () => {
    expect(detectarResultados([ev({ cnpj: '999' })], cnpjs, R)).toEqual([]);
  });
});

describe('detectarFiiTrimestral', () => {
  const linha = (refQuarter: string, symbol = 'HGLG11', cnpj = '11728688000147') => ({
    symbol,
    cnpj,
    refQuarter,
    fetchedAt: '2026-10-15T09:45:00.000Z',
  });

  it('1ª vez: grava o marco em silêncio', () => {
    const r = detectarFiiTrimestral([linha('2026-06-30')], new Map());
    expect(r.fatos).toEqual([]);
    expect(r.marcosNovos).toEqual([
      { symbol: 'HGLG11', tipo: 'fii_trimestral', marco: { refQuarter: '2026-06-30' } },
    ]);
  });

  it('refQuarter novo avisa (1 por CNPJ); o mesmo não regrava', () => {
    const marcos = new Map([['HGLG11', { refQuarter: '2026-06-30' }]]);
    const r = detectarFiiTrimestral([linha('2026-06-30'), linha('2026-09-30')], marcos);
    expect(r.fatos).toEqual([
      expect.objectContaining({
        chave: 'fii_tri:11728688000147:2026-09-30',
        tickers: ['HGLG11'],
        refQuarter: '2026-09-30',
        publicadoEm: '2026-10-15',
      }),
    ]);
    expect(r.marcosNovos).toHaveLength(1);
    const segunda = detectarFiiTrimestral(
      [linha('2026-09-30')],
      new Map([['HGLG11', { refQuarter: '2026-09-30' }]]),
    );
    expect(segunda).toEqual({ fatos: [], marcosNovos: [] });
  });
});

describe('detectarProventos', () => {
  const p = (over: Partial<LinhaProventoAlerta> = {}): LinhaProventoAlerta => ({
    id: 'd1',
    symbol: 'TAEE11',
    source: 'BRAPI',
    tipo: 'DIVIDENDO',
    valor: 1.1,
    dataPagamento: '2026-10-27',
    dataExGravada: '2026-10-20',
    dataExOrigem: 'dataCom',
    criadoEm: ha(0.3),
    ...over,
  });

  it('linha nova com data-com futura avisa (BRAPI grava a data-com real)', () => {
    expect(detectarProventos([p()], R, SCORING_PARAMS_V1)).toEqual([
      {
        tipo: 'provento',
        chave: 'provento:TAEE11:dividendo:2026-10-20',
        symbol: 'TAEE11',
        tipoProvento: 'dividendo',
        valor: 1.1,
        dataCom: '2026-10-20',
        pagamento: '2026-10-27',
      },
    ]);
  });

  it('provento do backfill (createdAt antigo) e data-com passada não avisam', () => {
    expect(detectarProventos([p({ criadoEm: ha(10) })], R, SCORING_PARAMS_V1)).toEqual([]);
    expect(detectarProventos([p({ dataExGravada: '2026-10-15' })], R, SCORING_PARAMS_V1)).toEqual(
      [],
    );
  });

  it('YAHOO usa a data EX: data-com = pregão anterior', () => {
    const yahoo = (ex: string) =>
      p({ source: 'YAHOO', dataExGravada: ex, dataExOrigem: 'date', dataPagamento: null });
    // ex na segunda 19/10 → data-com sexta 16/10 = hoje: avisa
    expect(detectarProventos([yahoo('2026-10-19')], R, SCORING_PARAMS_V1)).toEqual([
      expect.objectContaining({ dataCom: '2026-10-16', pagamento: null }),
    ]);
    // ex hoje (16/10) → data-com 15/10: já passou
    expect(detectarProventos([yahoo('2026-10-16')], R, SCORING_PARAMS_V1)).toEqual([]);
  });

  it('repetição (mesmo símbolo, tipo e data-com) = 1; amortização fica fora; JCP mapeado', () => {
    const f = detectarProventos(
      [p({ id: 'a' }), p({ id: 'b', valor: 2.2 }), p({ id: 'c', tipo: 'AMORTIZAÇÃO' })],
      R,
      SCORING_PARAMS_V1,
    );
    expect(f).toHaveLength(1);
    expect(f[0].valor).toBe(1.1);
    expect(detectarProventos([p({ tipo: 'JCP' })], R, SCORING_PARAMS_V1)[0].tipoProvento).toBe(
      'jcp',
    );
  });
});

describe('detectarCriterios', () => {
  const av = (over: Partial<AvaliacaoCriterios5> = {}): AvaliacaoCriterios5 => ({
    symbol: 'WEGE3',
    atendidos: 5,
    aplicaveis: 6,
    anoInicio: 2021,
    anoFim: 2025,
    paramsVersion: 2,
    semDado: false,
    ...over,
  });
  const marco = (over: Partial<MarcoCriterios> = {}): MarcoCriterios => ({
    atendidos: 4,
    aplicaveis: 6,
    anoInicio: 2021,
    anoFim: 2025,
    paramsVersion: 2,
    ...over,
  });
  const agora = '2026-10-16T11:10:00.000Z';

  it('4 → 5 avisa e o marco guarda o anterior e mudouEm', () => {
    const r = detectarCriterios([av()], new Map([['WEGE3', marco()]]), agora);
    expect(r.fatos).toEqual([
      {
        tipo: 'criterios',
        chave: 'criterios5:WEGE3:2025:v2:4/6>5/6:inicio',
        symbol: 'WEGE3',
        de: { atendidos: 4, aplicaveis: 6 },
        para: { atendidos: 5, aplicaveis: 6 },
        anoInicio: 2021,
        anoFim: 2025,
        mudouEm: agora,
      },
    ]);
    expect(r.marcosNovos[0].marco).toMatchObject({
      atendidos: 5,
      anterior: { atendidos: 4, aplicaveis: 6 },
      mudouEm: agora,
    });
  });

  it('ida e volta A→B→A→B na mesma anoFim gera chaves distintas; repetir a rodada não', () => {
    const d1 = '2026-10-16T11:10:00.000Z';
    const d2 = '2026-10-17T11:10:00.000Z';
    const d3 = '2026-10-18T11:10:00.000Z';
    const r1 = detectarCriterios([av()], new Map([['WEGE3', marco()]]), d1);
    const r2 = detectarCriterios(
      [av({ atendidos: 4 })],
      new Map([['WEGE3', r1.marcosNovos[0].marco]]),
      d2,
    );
    const r3 = detectarCriterios([av()], new Map([['WEGE3', r2.marcosNovos[0].marco]]), d3);
    const chaves = [r1, r2, r3].map((r) => r.fatos[0].chave);
    expect(chaves).toEqual([
      'criterios5:WEGE3:2025:v2:4/6>5/6:inicio',
      `criterios5:WEGE3:2025:v2:5/6>4/6:${d1}`,
      `criterios5:WEGE3:2025:v2:4/6>5/6:${d2}`,
    ]);
    expect(new Set(chaves).size).toBe(3);
    // marco não gravado (lote com erro): a rodada seguinte reencontra a MESMA chave
    const repetida = detectarCriterios([av()], new Map([['WEGE3', r2.marcosNovos[0].marco]]), d3);
    expect(repetida.fatos[0].chave).toBe(r3.fatos[0].chave);
  });

  it('1ª vez e troca de paramsVersion (v1 → v2) não avisam: só regravam o marco', () => {
    const primeira = detectarCriterios([av()], new Map(), agora);
    expect(primeira.fatos).toEqual([]);
    expect(primeira.marcosNovos).toHaveLength(1);
    const troca = detectarCriterios(
      [av()],
      new Map([['WEGE3', marco({ paramsVersion: 1 })]]),
      agora,
    );
    expect(troca.fatos).toEqual([]);
    expect(troca.marcosNovos[0].marco).toEqual({
      atendidos: 5,
      aplicaveis: 6,
      anoInicio: 2021,
      anoFim: 2025,
      paramsVersion: 2,
    });
  });

  it('troca de aplicáveis e avaliação sem dado são silenciosas; sem mudança = 0 gravações', () => {
    expect(
      detectarCriterios([av({ aplicaveis: 5 })], new Map([['WEGE3', marco()]]), agora).fatos,
    ).toEqual([]);
    expect(
      detectarCriterios([av({ semDado: true })], new Map([['WEGE3', marco()]]), agora),
    ).toEqual({ fatos: [], marcosNovos: [] });
    expect(detectarCriterios([av({ atendidos: 4 })], new Map([['WEGE3', marco()]]), agora)).toEqual(
      { fatos: [], marcosNovos: [] },
    );
  });

  it('janela que rola sem mudar a contagem atualiza o marco sem avisar', () => {
    const r = detectarCriterios(
      [av({ atendidos: 4, anoInicio: 2022, anoFim: 2026 })],
      new Map([['WEGE3', marco({ anterior: { atendidos: 3, aplicaveis: 6 }, mudouEm: agora })]]),
      agora,
    );
    expect(r.fatos).toEqual([]);
    expect(r.marcosNovos[0].marco).toMatchObject({ anoFim: 2026, anterior: { atendidos: 3 } });
  });
});

describe('leitura dos marcos', () => {
  it('Json ilegível vira null (o detector trata como 1ª vez)', () => {
    expect(lerMarcoCriterios(null)).toBeNull();
    expect(lerMarcoCriterios({ atendidos: '4' })).toBeNull();
    expect(lerMarcoFiiTrimestral({ refQuarter: 'ontem' })).toBeNull();
    expect(lerMarcoFiiTrimestral({ refQuarter: '2026-06-30' })).toEqual({
      refQuarter: '2026-06-30',
    });
    expect(
      lerMarcoCriterios({ atendidos: 4, aplicaveis: 6, anoFim: 2025, paramsVersion: 2 }),
    ).toEqual({ atendidos: 4, aplicaveis: 6, anoInicio: 2021, anoFim: 2025, paramsVersion: 2 });
  });
});
