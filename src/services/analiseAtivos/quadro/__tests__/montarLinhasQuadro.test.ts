import { describe, it, expect } from 'vitest';
import {
  FLAG_CNPJ_EM_CONFERENCIA,
  anosSeguidosComProvento,
  ehFiagro,
  montarLinhasQuadro,
  type EntradaQuadro,
  type MultiplosQuadro,
  type ScoreQuadro,
} from '../montarLinhasQuadro';

const DATA_REF = new Date('2026-09-29T00:00:00.000Z');
const GERADO = new Date('2026-09-30T10:40:00.000Z');

function score(over: Partial<ScoreQuadro> & { symbol: string; cnpj: string }): ScoreQuadro {
  return {
    classe: 'acao',
    regua: 'acao',
    fiiTipo: null,
    tickerReferencia: over.symbol,
    indiceMf: 7,
    componentes: { lucro: { estado: 'calculado' } },
    checks: [{ status: 'atende' }, { status: 'parcial' }],
    criteriosAplicaveis: 5,
    criteriosAtendidos: 4,
    incompleto: false,
    motivosIncompleto: [],
    paramsVersion: 1,
    ...over,
  };
}

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
    ...over,
  };
}

const resumo = (symbol: string, negociado = true) => ({
  symbol,
  ultimoPregao: DATA_REF,
  closeRaw: 10,
  volumeMedio21: 1_000_000,
  baixaLiquidez: false,
  negociadoUltimos30: negociado,
});

const setor = (raiz: string, s = 'Bens Industriais', seg = 'Motores') => ({
  raiz,
  nomePregao: raiz,
  setor: s,
  subsetor: 'Máquinas',
  segmento: seg,
  segmentoListagem: 'Novo Mercado',
});

function entrada(over: Partial<EntradaQuadro> = {}): EntradaQuadro {
  return {
    hoje: '2026-10-02',
    dataRef: DATA_REF,
    geradoEm: GERADO,
    acoes: [
      { symbol: 'WEGE3', cnpj: 'C-WEG', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'TGMA3', cnpj: 'C-TGM', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'AURE3', cnpj: 'C-AUR', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'CEDO4', cnpj: 'C-CED', classeTitulo: 'PN', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'SHOW3', cnpj: 'C-SHO', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'KLBN4', cnpj: 'C-KLA', classeTitulo: 'PN', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'KLBN11', cnpj: 'C-KLA', classeTitulo: 'UNIT', unitQtdOn: 1, unitQtdPn: 4 },
    ],
    fiis: [
      { symbol: 'HGLG11', cnpj: 'F-HGL' },
      { symbol: 'HCTR11', cnpj: 'F-HCT' },
      { symbol: 'HGPO11', cnpj: 'F-HGP' },
      { symbol: 'HFOF11', cnpj: 'F-HFO' },
      { symbol: 'AGRO11', cnpj: 'F-AGR' },
    ],
    scores: [
      score({ symbol: 'WEGE3', cnpj: 'C-WEG', indiceMf: 9.01 }),
      score({
        symbol: 'TGMA3',
        cnpj: 'C-TGM',
        indiceMf: 8.48,
        incompleto: true,
        motivosIncompleto: ['div:fonte_defasada'],
      }),
      score({
        symbol: 'AURE3',
        cnpj: 'C-AUR',
        indiceMf: 0.08,
        componentes: { lucro: { estado: 'zero_regra', motivo: 'prejuizo' } },
      }),
      score({ symbol: 'CEDO4', cnpj: 'C-CED' }),
      score({ symbol: 'SHOW3', cnpj: 'C-SHO' }),
      score({ symbol: 'KLBN4', cnpj: 'C-KLA', indiceMf: 2.87, tickerReferencia: 'KLBN4' }),
      score({
        symbol: 'HGLG11',
        cnpj: 'F-HGL',
        classe: 'fii',
        regua: 'fii_tijolo',
        fiiTipo: 'tijolo',
      }),
      score({
        symbol: 'HGPO11',
        cnpj: 'F-HGP',
        classe: 'fii',
        regua: 'fii_tijolo',
        fiiTipo: 'tijolo',
      }),
    ],
    multiplos: [
      mult('WEGE3'),
      mult('TGMA3'),
      mult('AURE3', { pl: null }),
      mult('CEDO4'),
      mult('SHOW3'),
      mult('KLBN11'),
      mult('HGLG11', { rend12m: 13.2, pl: null }),
      mult('HCTR11', { rend12m: 4, flags: ['proventos_defasados_cobertura_antiga'] }),
    ],
    resumos: [
      resumo('WEGE3'),
      resumo('TGMA3'),
      resumo('AURE3'),
      resumo('CEDO4', false),
      resumo('SHOW3'),
      resumo('KLBN4'),
      resumo('KLBN11'),
      resumo('HGLG11'),
      resumo('HCTR11'),
      resumo('HGPO11', false),
      resumo('HFOF11'),
      resumo('AGRO11'),
    ],
    setores: [
      setor('WEGE'),
      setor('TGMA', 'Bens Industriais', 'Transporte'),
      setor('AURE'),
      setor('CEDO'),
      setor('KLBN'),
    ],
    nomesCia: [{ cnpj: 'C-WEG', nome: 'WEG S.A.' }],
    nomesFii: [
      { ticker: 'HGLG11', nomeB3: 'FII CSHG LOG' },
      { ticker: 'AGRO11', nomeB3: 'FIAGRO XYZ' },
    ],
    assets: [
      { id: 'asset-wege3', symbol: 'WEGE3', name: 'WEG' },
      { id: 'asset-hglg11', symbol: 'HGLG11', name: 'HGLG11' },
    ],
    fiiMensal: [
      {
        cnpj: 'F-HGL',
        segmentoCvm: 'Logística',
        tipoVigente: 'tijolo',
        cotistas: 300_000,
        pl: 6e9,
        cotas: 4e7,
      },
      {
        cnpj: 'F-HCT',
        segmentoCvm: 'Títulos e Val. Mob.',
        tipoVigente: 'papel',
        cotistas: 50_000,
        pl: 3e8,
        cotas: 7e6,
      },
      {
        cnpj: 'F-HFO',
        segmentoCvm: 'Títulos e Val. Mob.',
        tipoVigente: 'fof',
        cotistas: 40_000,
        pl: 1e9,
        cotas: 1e7,
      },
    ],
    fiiTrimestral: [{ cnpj: 'F-HGL', vacanciaFisicaCvmPct: 5, nImoveisRenda: 20, nCri: 0 }],
    ultimosPregoes: [
      { symbol: 'WEGE3', ordem: 1, closeRaw: 10 },
      { symbol: 'WEGE3', ordem: 2, closeRaw: 8 },
    ],
    porAcaoAno: [
      // WEGE3: 2025 = 3,2× 2024 sem payout ⇒ provento suspeito recente
      { symbol: 'WEGE3', anoFiscal: 2023, dpaAjHoje: 0.7, payoutDmplPct: null },
      { symbol: 'WEGE3', anoFiscal: 2024, dpaAjHoje: 0.76, payoutDmplPct: null },
      { symbol: 'WEGE3', anoFiscal: 2025, dpaAjHoje: 2.45, payoutDmplPct: null },
      { symbol: 'WEGE3', anoFiscal: 2026, dpaAjHoje: 1, payoutDmplPct: null },
      // HGLG11: 2016 com 6 meses de informe sai; 2026 (corrente) sai
      { symbol: 'HGLG11', anoFiscal: 2016, dpaAjHoje: 3, payoutDmplPct: null },
      { symbol: 'HGLG11', anoFiscal: 2024, dpaAjHoje: 13.2, payoutDmplPct: null },
      { symbol: 'HGLG11', anoFiscal: 2025, dpaAjHoje: 13.2, payoutDmplPct: null },
      { symbol: 'HGLG11', anoFiscal: 2026, dpaAjHoje: 5.5, payoutDmplPct: null },
    ],
    lucrosFy: [
      { cnpj: 'C-WEG', anoFiscal: 2024, lucro: 6.0e9 },
      { cnpj: 'C-WEG', anoFiscal: 2025, lucro: 6.4e9 },
      { cnpj: 'C-WEG', anoFiscal: 2026, lucro: 3e9 },
      { cnpj: 'C-AUR', anoFiscal: 2025, lucro: -6.6e8 },
    ],
    mesesInformeFii: [
      { cnpj: 'F-HGL', ano: 2016, meses: 6 },
      { cnpj: 'F-HGL', ano: 2024, meses: 12 },
      { cnpj: 'F-HGL', ano: 2025, meses: 12 },
      { cnpj: 'F-HGL', ano: 2026, meses: 8 },
    ],
    contagens: [],
    ...over,
  };
}

const linha = (r: ReturnType<typeof montarLinhasQuadro>, s: string) => {
  const l = r.linhas.find((x) => x.symbol === s);
  if (!l) throw new Error(`sem linha ${s}`);
  return l;
};

describe('montarLinhasQuadro', () => {
  const r = montarLinhasQuadro(entrada());

  it('universo = cadastro inteiro (score opcional), uma linha por ticker', () => {
    expect(r.linhas).toHaveLength(12);
    expect(r.noQuadroPorClasse).toEqual({ acao: 6, fii: 3 });
    expect(r.foraDoQuadroPorClasse).toEqual({ acao: 1, fii: 2 });
  });

  it('WEGE3 completo: calculado, nome do catálogo, assetId, variação do dia, pares', () => {
    const l = linha(r, 'WEGE3');
    expect(l).toMatchObject({
      classe: 'acao',
      noQuadro: true,
      foraDoQuadroMotivo: null,
      temScore: true,
      estadoIndice: 'calculado',
      indiceMf: 9.01,
      nome: 'WEG',
      setor: 'Bens Industriais',
      assetId: 'asset-wege3',
      statusCriterios: ['atende', 'parcial'],
      geradoEm: GERADO,
    });
    expect(l.variacaoDiaPct).toBeCloseTo(25);
    expect(l.pares).toContain('AURE3');
    expect(l.pares).not.toContain('WEGE3');
  });

  it('TGMA3 incompleto com os motivos do score', () => {
    expect(linha(r, 'TGMA3')).toMatchObject({
      estadoIndice: 'incompleto',
      motivosIncompleto: ['div:fonte_defasada'],
    });
  });

  it('AURE3 zero pela regra (incompleto=false) guarda o componente zerado', () => {
    expect(linha(r, 'AURE3')).toMatchObject({
      estadoIndice: 'zero_regra',
      componentesZeroRegra: ['lucro:prejuizo'],
      indiceMf: 0.08,
    });
  });

  it('HCTR11: FII negociado sem score entra no Quadro como sem_score', () => {
    expect(linha(r, 'HCTR11')).toMatchObject({
      classe: 'fii',
      noQuadro: true,
      temScore: false,
      estadoIndice: 'sem_score',
      indiceMf: null,
      fiiTipo: 'papel',
    });
  });

  it('FII não negociado fica fora do Quadro (só na busca)', () => {
    expect(linha(r, 'HGPO11')).toMatchObject({
      noQuadro: false,
      foraDoQuadroMotivo: 'sem_negociacao_30',
      estadoIndice: 'calculado',
    });
  });

  it('ação com score e sem negociação nos últimos 30 pregões fica fora do Quadro', () => {
    expect(linha(r, 'CEDO4')).toMatchObject({
      noQuadro: false,
      foraDoQuadroMotivo: 'sem_negociacao_30',
      temScore: true,
    });
  });

  it('Fiagro fica fora do Quadro mesmo negociado', () => {
    expect(linha(r, 'AGRO11')).toMatchObject({ noQuadro: false, foraDoQuadroMotivo: 'fiagro' });
    expect(ehFiagro('FIAGRO XYZ')).toBe(true);
    expect(ehFiagro('FI-AGRO ABC')).toBe(true);
    expect(ehFiagro('FII CSHG LOG')).toBe(false);
  });

  it('nome do FII: Asset.name igual ao ticker cede ao nome do cadastro B3', () => {
    expect(linha(r, 'HGLG11')).toMatchObject({ nome: 'FII CSHG LOG', assetId: 'asset-hglg11' });
  });

  it('FoF sem score fica fora do Índice', () => {
    expect(linha(r, 'HFOF11')).toMatchObject({ estadoIndice: 'fora_do_indice', fiiTipo: 'fof' });
  });

  it('ação do Quadro sem setor B3 gera alerta', () => {
    const a = r.alertas.find((x) => x.codigo === 'quadro_sem_setor');
    expect(a?.mensagem).toMatch(/SHOW3/);
    expect(linha(r, 'SHOW3').setor).toBeNull();
  });

  it('unit sem score próprio usa o Índice da empresa', () => {
    expect(linha(r, 'KLBN11')).toMatchObject({
      temScore: true,
      indiceMf: 2.87,
      tickerReferencia: 'KLBN4',
      estadoIndice: 'calculado',
    });
    // uma linha por empresa nos pares
    const pares = linha(r, 'WEGE3').pares as string[];
    expect(pares.filter((p) => p.startsWith('KLBN'))).toHaveLength(1);
  });

  it('serie10a sem o ano corrente: lucro FY nas ações, rendimento com 12 meses nos FIIs', () => {
    expect(linha(r, 'WEGE3').serie10a).toEqual([
      { ano: 2024, valor: 6.0e9 },
      { ano: 2025, valor: 6.4e9 },
    ]);
    expect(linha(r, 'HGLG11').serie10a).toEqual([
      { ano: 2024, valor: 13.2 },
      { ano: 2025, valor: 13.2 },
    ]);
    expect(linha(r, 'HGLG11').serieUlt12m).toBe(13.2);
  });

  it('salto de provento recente vira provento_suspeito; anosDividendo conta anos fechados', () => {
    const w = linha(r, 'WEGE3');
    expect(w.flags).toContain('provento_suspeito');
    expect(w.anosDividendo).toBe(3);
    expect(linha(r, 'TGMA3').flags).not.toContain('provento_suspeito');
  });

  it('salto antigo não marca o DY', () => {
    const r2 = montarLinhasQuadro(
      entrada({
        porAcaoAno: [
          { symbol: 'WEGE3', anoFiscal: 2018, dpaAjHoje: 0.1, payoutDmplPct: null },
          { symbol: 'WEGE3', anoFiscal: 2019, dpaAjHoje: 0.9, payoutDmplPct: null },
          { symbol: 'WEGE3', anoFiscal: 2020, dpaAjHoje: 0.9, payoutDmplPct: null },
        ],
      }),
    );
    expect(linha(r2, 'WEGE3').flags).not.toContain('provento_suspeito');
  });

  it('FII: ano com salto > 2× fica suspeito na série', () => {
    const r2 = montarLinhasQuadro(
      entrada({
        porAcaoAno: [
          { symbol: 'HGLG11', anoFiscal: 2024, dpaAjHoje: 5, payoutDmplPct: null },
          { symbol: 'HGLG11', anoFiscal: 2025, dpaAjHoje: 13, payoutDmplPct: null },
        ],
      }),
    );
    const s = linha(r2, 'HGLG11');
    expect(s.serie10a).toEqual([
      { ano: 2024, valor: 5 },
      { ano: 2025, valor: 13, suspeito: true },
    ]);
    expect(s.flags).toContain('provento_suspeito');
  });

  it('FII com ticker↔CNPJ não conferido: números do informe em conferência e não vira par', () => {
    const base = entrada();
    const r2 = montarLinhasQuadro(
      entrada({
        fiis: [...base.fiis, { symbol: 'PLTB11', cnpj: 'F-PLT', conferido: false }],
        multiplos: [...base.multiplos, mult('PLTB11', { pvp: 3.78 })],
        resumos: [...base.resumos, resumo('PLTB11')],
        fiiMensal: [
          ...base.fiiMensal,
          {
            cnpj: 'F-PLT',
            segmentoCvm: 'Logística',
            tipoVigente: 'tijolo',
            cotistas: 10,
            pl: 1e6,
            cotas: 1e6,
          },
        ],
      }),
    );
    const p = linha(r2, 'PLTB11');
    expect(p.noQuadro).toBe(true);
    expect(p.pvp).toBeNull();
    expect(p.patrimonio).toBeNull();
    expect(p.valorMercado).toBeNull();
    expect(p.segmentoCvm).toBeNull();
    expect(p.flags).toContain(FLAG_CNPJ_EM_CONFERENCIA);
    expect(linha(r2, 'HGLG11').pares).not.toContain('PLTB11');
  });

  it('valor de mercado do FII = cota × cotas', () => {
    expect(linha(r, 'HGLG11').valorMercado).toBe(10 * 4e7);
  });

  it('anosSeguidosComProvento para no primeiro ano sem provento', () => {
    expect(
      anosSeguidosComProvento([
        { ano: 2022, valor: 1 },
        { ano: 2023, valor: 0 },
        { ano: 2024, valor: 1 },
        { ano: 2025, valor: 2 },
      ]),
    ).toBe(2);
  });
});
