/**
 * Sanidade SEC (LPA, DPA declarado, salto de receita, float de capa) e universo EUA por CIK
 * (histerese, overrides, ticker sempre da SEC). Decisão do Wellington de 17/10: stocks ≥ US$ 2 bi
 * (sai < US$ 1,6 bi), REITs de patrimônio ≥ US$ 2 bi.
 */
import { describe, expect, it } from 'vitest';
import { overrideDoCik, segmentoCuradoReit } from '@/services/analiseAtivos/eua/overridesEua';
import {
  alertasSanidade,
  declaredSuspeito,
  lpaConfere,
  saltoBalanco,
  saltoReceita,
  sanidadeFloat,
} from '@/services/analiseAtivos/eua/sanidadeSec';
import {
  decidirUniverso,
  ehClasseDoPrincipal,
  tickersListados,
  type CandidatoUniverso,
} from '@/services/analiseAtivos/eua/universoEua';
import { UNIVERSO_EUA_PADRAO } from '@/types/analiseAtivosEua';

const REGRAS = UNIVERSO_EUA_PADRAO.sanidadeFloat;

describe('sanidade dos fundamentos', () => {
  it('LPA confere com lucro ÷ média diluída (±3%)', () => {
    expect(lpaConfere(112_010e6, 15_005e6, 7.46)).toBe(true);
    expect(lpaConfere(112_010e6, 15_005e6, 7.9)).toBe(false);
    expect(lpaConfere(null, 15_005e6, 7.46)).toBeNull();
  });

  it('PLD: Declared 0,01 com ~US$ 3,85/ação pagos é suspeito; AMT dentro de 10% não é', () => {
    expect(declaredSuspeito(0.01, 3_570e6, 927e6)).toBe(true);
    expect(declaredSuspeito(6.8, 3_120e6, 467e6)).toBe(false);
    expect(declaredSuspeito(0.01, null, 927e6)).toBe(false);
  });

  it('receita com variação > 50% a/a (O 2022, fusão VEREIT) vira alerta', () => {
    expect(saltoReceita(2_080e6, 3_344e6)).toBe(true);
    expect(saltoReceita(3_344e6, 4_079e6)).toBe(false);
    const a = alertasSanidade([
      {
        anoFiscal: 2021,
        receita: 2_080e6,
        lucroControladora: 359e6,
        acoesMediaDiluida: 438e6,
        lpaDiluido: 0.82,
        plControladora: 26e9,
      },
      {
        anoFiscal: 2022,
        receita: 3_344e6,
        lucroControladora: 869e6,
        acoesMediaDiluida: 604e6,
        lpaDiluido: 1.44,
        plControladora: -1,
      },
    ]);
    expect(a.map((x) => [x.codigo, x.anoFiscal])).toEqual([
      ['receita_salto', 2022],
      ['pl_nao_positivo', 2022],
    ]);
  });

  it('dívida ou caixa > 8× dos dois vizinhos: alerta divida_salto (AMT 2019 com 1,9 mi)', () => {
    expect(saltoBalanco(21_160e6, 1.9e6, 29_288e6)).toBe(true);
    expect(saltoBalanco(21_160e6, 24_055e6, 29_288e6)).toBe(false);
    // só um vizinho distante (nova dívida grande num ano) não basta
    expect(saltoBalanco(1e9, 10e9, 11e9)).toBe(false);
    expect(saltoBalanco(null, 1.9e6, 29_288e6)).toBe(false);
    const base = {
      receita: 1e9,
      lucroControladora: null,
      acoesMediaDiluida: null,
      lpaDiluido: null,
    };
    const a = alertasSanidade([
      { ...base, anoFiscal: 2018, plControladora: 1, dividaBruta: 21_160e6, caixa: 1e9 },
      { ...base, anoFiscal: 2019, plControladora: 1, dividaBruta: 1.9e6, caixa: 1e9 },
      { ...base, anoFiscal: 2020, plControladora: 1, dividaBruta: 29_288e6, caixa: 1e9 },
    ]);
    expect(a.map((x) => [x.codigo, x.anoFiscal])).toEqual([['divida_salto', 2019]]);
  });
});

describe('sanidade do free float de capa', () => {
  it('erro de escala: US$ 603,6 bi num emissor de US$ 12 bi de ativo → suspeito', () => {
    expect(sanidadeFloat(603.6e9, { acoesEmCirculacao: 61e6, ativoTotalUsd: 12e9 }, REGRAS)).toBe(
      'escala_suspeita',
    );
    // TRMK (17/10): US$ 961,6 bi de float, ativo de US$ 19,2 bi — o preço implícito (16 mil) não pega
    expect(
      sanidadeFloat(961.6e9, { acoesEmCirculacao: 58e6, ativoTotalUsd: 19.19e9 }, REGRAS),
    ).toBe('escala_suspeita');
  });

  it('acima de US$ 1 tri com ativo/ações que confirmam = ok (AAPL, NVDA em 2026)', () => {
    expect(
      sanidadeFloat(3_253e9, { acoesEmCirculacao: 14_594e6, ativoTotalUsd: 365e9 }, REGRAS),
    ).toBe('ok');
    expect(
      sanidadeFloat(4_000e9, { acoesEmCirculacao: 24_100e6, ativoTotalUsd: 320e9 }, REGRAS),
    ).toBe('ok');
    expect(sanidadeFloat(3_253e9, { acoesEmCirculacao: null, ativoTotalUsd: null }, REGRAS)).toBe(
      'escala_suspeita',
    );
  });

  it('preço implícito fora de [US$ 0,5; 100 mil] → absurdo; ≤ 0 → escala', () => {
    expect(sanidadeFloat(2.5e9, { acoesEmCirculacao: 20e9, ativoTotalUsd: null }, REGRAS)).toBe(
      'preco_implicito_absurdo',
    );
    expect(sanidadeFloat(2.5e9, { acoesEmCirculacao: 2e3, ativoTotalUsd: null }, REGRAS)).toBe(
      'preco_implicito_absurdo',
    );
    expect(sanidadeFloat(0, { acoesEmCirculacao: null, ativoTotalUsd: null }, REGRAS)).toBe(
      'escala_suspeita',
    );
    expect(sanidadeFloat(2.5e9, { acoesEmCirculacao: 50e6, ativoTotalUsd: 4e9 }, REGRAS)).toBe(
      'ok',
    );
  });
});

const candidato = (x: Partial<CandidatoUniverso>): CandidatoUniverso => ({
  cik: '1',
  nome: 'X',
  tickers: [{ symbol: 'XYZ', bolsa: 'NYSE' }],
  sic: 3571,
  publicFloatUsd: 5e9,
  publicFloatData: '2025-06-30',
  acoesEmCirculacao: 100e6,
  ativoTotalUsd: 10e9,
  tem10k: true,
  noUniversoAnterior: false,
  ...x,
});
const decidir = (c: CandidatoUniverso) =>
  decidirUniverso(c, UNIVERSO_EUA_PADRAO, overrideDoCik(c.cik));

describe('universo EUA por CIK', () => {
  it('histerese: entra com ≥ US$ 2 bi; quem já está só sai abaixo de US$ 1,6 bi', () => {
    expect(decidir(candidato({ publicFloatUsd: 2e9 })).noUniverso).toBe(true);
    expect(decidir(candidato({ publicFloatUsd: 1.8e9 }))).toMatchObject({
      noUniverso: false,
      foraMotivo: 'float_abaixo',
    });
    expect(decidir(candidato({ publicFloatUsd: 1.8e9, noUniversoAnterior: true })).noUniverso).toBe(
      true,
    );
    expect(decidir(candidato({ publicFloatUsd: 1.5e9, noUniversoAnterior: true })).foraMotivo).toBe(
      'float_abaixo',
    );
  });

  it('XOM: holding sem 10-K entra com o histórico do CIK 0000034088 (alerta informativo)', () => {
    const d = decidir(
      candidato({
        cik: '2115436',
        tickers: [{ symbol: 'XOM', bolsa: 'NYSE' }],
        sic: 2911,
        publicFloatUsd: 460e9,
        ativoTotalUsd: 450e9,
        acoesEmCirculacao: 4.2e9,
        tem10k: false,
      }),
    );
    expect(d).toMatchObject({
      noUniverso: true,
      classe: 'stock',
      cikHistorico: '0000034088',
      origem: 'override',
    });
    expect(d.alertas.map((a) => a.codigo)).toContain('ticker_sem_10k');
  });

  it('sem 10-K e sem override → fora (sem_10k)', () => {
    expect(decidir(candidato({ tem10k: false })).foraMotivo).toBe('sem_10k');
  });

  it('o ticker vem SEMPRE da SEC, mesmo com override (CIK 906107 do EQR = VMRK)', () => {
    const tickers = [{ symbol: 'VMRK', bolsa: 'NYSE' }];
    const d = decidir(
      candidato({ cik: '906107', sic: 6798, tickers, publicFloatUsd: 25.6e9, ativoTotalUsd: 20e9 }),
    );
    expect(d).toMatchObject({
      classe: 'reit',
      segmento: 'residencial',
      noUniverso: true,
      bolsa: 'NYSE',
    });
    expect(tickersListados(tickers).map((t) => t.symbol)).toEqual(['VMRK']);
    expect(Object.keys(overrideDoCik('2115436') ?? {})).not.toContain('symbol');
  });

  it('REITs: SIC 6798 = reit; INVH (SIC 6510) por override; hipotecários e não-REITs fora da aba', () => {
    expect(decidir(candidato({ cik: '726728', sic: 6798 }))).toMatchObject({
      classe: 'reit',
      reitTipo: 'equity',
      segmento: 'net_lease',
    });
    expect(decidir(candidato({ cik: '1687229', sic: 6510 }))).toMatchObject({
      classe: 'reit',
      segmento: 'residencial',
      noUniverso: true,
    });
    expect(decidir(candidato({ cik: '1423689', sic: 6798, publicFloatUsd: 8.6e9 }))).toMatchObject({
      noUniverso: false,
      foraMotivo: 'hipotecario',
      reitTipo: 'mortgage',
    });
    expect(decidir(candidato({ cik: '1981792', sic: 6798 }))).toMatchObject({
      classe: 'stock',
      noUniverso: true,
    });
    const semSegmento = decidir(candidato({ cik: '999999', sic: 6798 }));
    expect(semSegmento.alertas.map((a) => a.codigo)).toEqual(['reit_por_sic_suspeito']);
  });

  it('financeira = SIC 6000–6799 exceto 6798; float suspeito = fora com alerta', () => {
    expect(decidir(candidato({ sic: 6021 })).ehFinanceira).toBe(true);
    expect(decidir(candidato({ cik: '726728', sic: 6798 })).ehFinanceira).toBe(false);
    const d = decidir(
      candidato({ cik: '36146', sic: 6022, publicFloatUsd: 961.6e9, ativoTotalUsd: 19.19e9 }),
    );
    expect(d).toMatchObject({
      noUniverso: false,
      foraMotivo: 'float_suspeito',
      floatSanidade: 'escala_suspeita',
    });
    expect(d.alertas.map((a) => a.codigo)).toEqual(['float_suspeito']);
  });

  it('AVB: override de inclusão sem ticker nos arquivos da SEC fica fora, com alerta', () => {
    const d = decidir(
      candidato({
        cik: '915912',
        sic: 6798,
        tickers: [],
        publicFloatUsd: 28.9e9,
        ativoTotalUsd: 22e9,
      }),
    );
    expect(d).toMatchObject({ noUniverso: false, foraMotivo: 'sem_bolsa', classe: 'reit' });
    expect(d.alertas.map((a) => a.codigo)).toContain('override_sem_ticker');
    expect(segmentoCuradoReit('915912')).toBe('residencial');
  });

  it('OTC/sem bolsa fica fora', () => {
    expect(decidir(candidato({ tickers: [{ symbol: 'XYZF', bolsa: 'OTC' }] })).foraMotivo).toBe(
      'sem_bolsa',
    );
  });
});

describe('tickers que viram linha', () => {
  it('classes de ação do mesmo CIK entram; preferenciais, ETNs e dívida listada não', () => {
    const t = (s: string[], bolsa = 'NYSE') => s.map((symbol) => ({ symbol, bolsa }));
    expect(
      tickersListados(t(['GOOGL', 'GOOG', 'GOOGM', 'GOOGN'], 'Nasdaq')).map((x) => x.symbol),
    ).toEqual(['GOOGL', 'GOOG']);
    expect(tickersListados(t(['BRK-B', 'BRK-A'])).map((x) => x.symbol)).toEqual(['BRK-B', 'BRK-A']);
    expect(
      tickersListados(t(['JPM', 'JPM-PC', 'AMJB', 'JPM-PD', 'VYLD'])).map((x) => x.symbol),
    ).toEqual(['JPM']);
    expect(tickersListados(t(['DUK', 'DUKB', 'DUK-PA', 'DUKU'])).map((x) => x.symbol)).toEqual([
      'DUK',
    ]);
    expect(
      tickersListados(t(['AGNC', 'AGNCM', 'AGNCL', 'AGNCP'], 'Nasdaq')).map((x) => x.symbol),
    ).toEqual(['AGNC']);
    expect(tickersListados(t(['LBTYA', 'LBTYB', 'LBTYK'], 'Nasdaq')).map((x) => x.symbol)).toEqual([
      'LBTYA',
      'LBTYB',
      'LBTYK',
    ]);
    expect(
      tickersListados([
        { symbol: 'XOM', bolsa: 'NYSE' },
        { symbol: 'XOMX', bolsa: 'OTC' },
      ]).map((x) => x.symbol),
    ).toEqual(['XOM']);
  });

  it('ehClasseDoPrincipal', () => {
    expect(ehClasseDoPrincipal('FOXA', 'FOX')).toBe(true);
    expect(ehClasseDoPrincipal('SRE', 'SREA')).toBe(false);
    expect(ehClasseDoPrincipal('HEI', 'HEI-A')).toBe(true);
    expect(ehClasseDoPrincipal('BAC', 'BACRP')).toBe(false);
  });
});
