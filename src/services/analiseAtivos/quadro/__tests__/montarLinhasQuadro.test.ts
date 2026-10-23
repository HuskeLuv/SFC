import { describe, it, expect } from 'vitest';
import {
  FLAG_CNPJ_EM_CONFERENCIA,
  anosSeguidosComProvento,
  ehFiagro,
  montarLinhasQuadro,
  type EntradaQuadro,
  type MultiplosQuadro,
} from '../montarLinhasQuadro';
import type { CriteriosCompactos } from '@/types/analiseAtivosCriterios';

const DATA_REF = new Date('2026-09-29T00:00:00.000Z');
const GERADO = new Date('2026-09-30T10:40:00.000Z');

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
    paramsVersion: 1,
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
    multiplos: [
      mult('WEGE3'),
      // base de proventos defasada: DY ausente ⇒ o legado 'div:fonte_defasada'
      mult('TGMA3', { dy12mPct: null, flags: ['proventos_defasados_cobertura_antiga'] }),
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
      { ...resumo('KLBN4'), volumeMedio21: 2_000_000 },
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

  it('universo = cadastro inteiro, uma linha por ticker', () => {
    expect(r.linhas).toHaveLength(12);
    expect(r.noQuadroPorClasse).toEqual({ acao: 6, fii: 3 });
    expect(r.foraDoQuadroPorClasse).toEqual({ acao: 1, fii: 2 });
  });

  it('WEGE3 completo: nome do catálogo, assetId, variação do dia, pares, colunas legadas', () => {
    const l = linha(r, 'WEGE3');
    expect(l).toMatchObject({
      classe: 'acao',
      noQuadro: true,
      foraDoQuadroMotivo: null,
      nome: 'WEG',
      setor: 'Bens Industriais',
      assetId: 'asset-wege3',
      geradoEm: GERADO,
      regua: 'acao',
      tickerReferencia: 'WEGE3',
      paramsVersion: 1,
      motivosIncompleto: [],
      componentesZeroRegra: [],
    });
    expect(l.variacaoDiaPct).toBeCloseTo(25);
    expect(l.pares).toContain('AURE3');
    expect(l.pares).not.toContain('WEGE3');
  });

  it('D6-a: sem Índice MF em nenhuma linha (como o Quadro EUA)', () => {
    for (const l of r.linhas) {
      expect(l).toMatchObject({
        temScore: false,
        estadoIndice: 'sem_score',
        indiceMf: null,
        criteriosAtendidos: null,
        criteriosAplicaveis: null,
        statusCriterios: [],
      });
    }
  });

  it('TGMA3: base de proventos defasada vira o motivo legado div:fonte_defasada', () => {
    expect(linha(r, 'TGMA3').motivosIncompleto).toEqual(['div:fonte_defasada']);
  });

  it('AURE3: prejuízo no último FY guarda os componentes zerados pela regra', () => {
    expect(linha(r, 'AURE3').componentesZeroRegra).toEqual(['lucro:prejuizo', 'preco:prejuizo']);
  });

  it('A6: obrigacoesAtivoPct do FII vai para a linha; ação e entrada antiga = null', () => {
    const base = entrada();
    const rs = montarLinhasQuadro({
      ...base,
      multiplos: base.multiplos.map((m) =>
        m.symbol === 'HGLG11' ? { ...m, obrigacoesAtivoPct: 11.5, obrigacoesPlPct: 14 } : m,
      ),
    });
    expect(linha(rs, 'HGLG11')).toMatchObject({ obrigacoesAtivoPct: 11.5, obrigacoesPlPct: 14 });
    expect(linha(rs, 'WEGE3').obrigacoesAtivoPct).toBeNull();
    expect(linha(r, 'HGLG11').obrigacoesAtivoPct).toBeNull();
  });

  it('HCTR11: FII negociado sem múltiplos de régua entra no Quadro com o tipo do informe', () => {
    expect(linha(r, 'HCTR11')).toMatchObject({
      classe: 'fii',
      noQuadro: true,
      fiiTipo: 'papel',
      paramsVersion: 1,
    });
  });

  it('FII não negociado fica fora do Quadro (só na busca)', () => {
    expect(linha(r, 'HGPO11')).toMatchObject({
      noQuadro: false,
      foraDoQuadroMotivo: 'sem_negociacao_30',
      // sem informe: régua indefinida dos params; sem múltiplos: sem versão
      regua: 'fii_tijolo',
      paramsVersion: null,
    });
  });

  it('ação com resumo e sem negociação nos últimos 30 pregões fica fora do Quadro', () => {
    expect(linha(r, 'CEDO4')).toMatchObject({
      noQuadro: false,
      foraDoQuadroMotivo: 'sem_negociacao_30',
      regua: 'acao',
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

  it('FoF: régua fora do Índice e tipo fof', () => {
    expect(linha(r, 'HFOF11')).toMatchObject({ regua: 'fora_do_indice', fiiTipo: 'fof' });
  });

  it('ação do Quadro sem setor B3 gera alerta', () => {
    const a = r.alertas.find((x) => x.codigo === 'quadro_sem_setor');
    expect(a?.mensagem).toMatch(/SHOW3/);
    expect(linha(r, 'SHOW3').setor).toBeNull();
  });

  it('SHOW3 (registro cancelado em 01/09/2026): fora da ClassifSetorial e sem negócio há 19 pregões ⇒ deslistada, sem alerta', () => {
    const base = entrada();
    const show = { ...resumo('SHOW3'), ultimoPregao: new Date('2026-09-01T00:00:00.000Z') };
    const rs = montarLinhasQuadro({
      ...base,
      resumos: [...base.resumos.filter((x) => x.symbol !== 'SHOW3'), show],
    });
    expect(linha(rs, 'SHOW3')).toMatchObject({ noQuadro: false, foraDoQuadroMotivo: 'deslistada' });
    expect(rs.alertas.find((x) => x.codigo === 'quadro_sem_setor')).toBeUndefined();
    // raiz que saiu da lista (presenteUltimoArquivo = false) também; a 5 pregões ainda fica
    const saiu = montarLinhasQuadro({
      ...base,
      setores: [
        ...base.setores.filter((x) => x.raiz !== 'TGMA'),
        { ...setor('TGMA'), presenteUltimoArquivo: false },
      ],
      resumos: [
        ...base.resumos.filter((x) => !['SHOW3', 'TGMA3'].includes(x.symbol)),
        { ...resumo('TGMA3'), ultimoPregao: new Date('2026-09-15T00:00:00.000Z') },
        { ...resumo('SHOW3'), ultimoPregao: new Date('2026-09-22T00:00:00.000Z') },
      ],
    });
    expect(linha(saiu, 'TGMA3').foraDoQuadroMotivo).toBe('deslistada');
    expect(linha(saiu, 'SHOW3')).toMatchObject({ noQuadro: true, foraDoQuadroMotivo: null });
  });

  it('unit: colunas da empresa calculadas no ticker de referência (maior volume)', () => {
    expect(linha(r, 'KLBN11')).toMatchObject({ regua: 'acao', tickerReferencia: 'KLBN4' });
    expect(linha(r, 'KLBN4')).toMatchObject({ regua: 'acao', tickerReferencia: 'KLBN4' });
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

  it('pares de FII: mesmo segmento CVM e tipo, sem completar com outro tipo', () => {
    const base = entrada();
    const r2 = montarLinhasQuadro(
      entrada({
        fiis: [...base.fiis, { symbol: 'MXRF11', cnpj: 'F-MXR' }],
        resumos: [...base.resumos, resumo('MXRF11')],
        fiiMensal: [
          ...base.fiiMensal,
          {
            cnpj: 'F-MXR',
            segmentoCvm: 'Logística',
            tipoVigente: 'papel',
            cotistas: 10,
            pl: 1e9,
            cotas: 1e8,
          },
        ],
      }),
    );
    expect(linha(r2, 'MXRF11').pares).toEqual([]);
    expect(linha(r2, 'HGLG11').pares).not.toContain('MXRF11');
  });

  it('v2.5: pares de FII pelo tipo EXIBIDO — híbrido com perfil tijolo é par de tijolo', () => {
    const base = entrada();
    const r2 = montarLinhasQuadro(
      entrada({
        fiis: [...base.fiis, { symbol: 'HIBR11', cnpj: 'F-HIB' }],
        resumos: [...base.resumos, resumo('HIBR11')],
        fiiMensal: [
          ...base.fiiMensal,
          {
            cnpj: 'F-HIB',
            segmentoCvm: 'Logística',
            tipoVigente: 'hibrido',
            cotistas: 10,
            pl: 1e9,
            cotas: 1e8,
          },
        ],
        criterios: [
          { symbol: 'HIBR11', perfil: 'fii_tijolo', criterios: {} },
          { symbol: 'HGLG11', perfil: 'fii_tijolo', criterios: {} },
        ],
      }),
    );
    // a coluna continua com o tipo CVM bruto
    expect(linha(r2, 'HIBR11').fiiTipo).toBe('hibrido');
    expect(linha(r2, 'HIBR11').pares).toContain('HGLG11');
    expect(linha(r2, 'HGLG11').pares).toContain('HIBR11');
  });

  it('valor de mercado do FII = cota × cotas', () => {
    expect(linha(r, 'HGLG11').valorMercado).toBe(10 * 4e7);
  });

  describe('valor de mercado da ação = a contagem dos múltiplos (backtest 18/10/2026, A6–A8)', () => {
    const cont = (
      cnpj: string,
      data: string,
      total: number,
      o: { status?: 'ok' | 'alerta'; razaoLpa?: number; fonte?: string } = {},
    ) => ({
      cnpj,
      data,
      on: total,
      pn: 0,
      total,
      fonte: o.fonte ?? 'itr',
      razaoLpa: o.razaoLpa ?? 1,
      status: o.status ?? ('ok' as const),
    });
    const acoes: EntradaQuadro['acoes'] = [
      { symbol: 'ORVR3', cnpj: 'C-ORV', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'TEND3', cnpj: 'C-TEN', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
      { symbol: 'KLBN11', cnpj: 'C-KLB', classeTitulo: 'UNIT', unitQtdOn: 1, unitQtdPn: 4 },
      { symbol: 'SIMH3', cnpj: 'C-SIM', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
    ];
    const precos: Record<string, number> = { ORVR3: 20, TEND3: 26.97, KLBN11: 18.12, SIMH3: 14.5 };
    const rr = montarLinhasQuadro(
      entrada({
        acoes,
        resumos: acoes.map((a) => ({ ...resumo(a.symbol), closeRaw: precos[a.symbol] })),
        multiplos: acoes.map((a) => mult(a.symbol, { preco: precos[a.symbol] })),
        contagens: [
          // ORVR3: só 'alerta' recentes (certas: follow-on) e o split ×4 de 11/08/2026 depois de 30/06
          cont('C-ORV', '2025-12-31', 96_127_000, { status: 'alerta', fonte: 'dfp_x1000' }),
          cont('C-ORV', '2024-12-31', 82_951_000, { fonte: 'dfp_x1000' }),
          cont('C-ORV', '2026-06-30', 137_324_000, { status: 'alerta', razaoLpa: 5.21 }),
          // TEND3: ITR 2T26 com a tesouraria errada, desmentido pelo LPA ⇒ vale o 1T26
          cont('C-TEN', '2025-12-31', 121_182_000, { fonte: 'dfp_x1000' }),
          cont('C-TEN', '2026-03-31', 122_578_000),
          cont('C-TEN', '2026-06-30', 57_430_000, { status: 'alerta', razaoLpa: 0.4553 }),
          // KLBN11: só a unit no cadastro ⇒ ÷ 5
          cont('C-KLB', '2025-12-31', 6_135_427_665, { fonte: 'dfp' }),
          cont('C-KLB', '2026-06-30', 6_152_895_333),
          // SIMH3: a última 'ok' é de 2024; vale a 'alerta' de 30/06/2026 (grupamento + emissão)
          cont('C-SIM', '2024-09-30', 862_026_143),
          cont('C-SIM', '2024-12-31', 859_960_351, { fonte: 'dfp' }),
          cont('C-SIM', '2026-06-30', 583_759_291, { status: 'alerta', razaoLpa: 0.88 }),
        ],
        eventosAcoes: [
          {
            symbol: 'ORVR3',
            dataEvento: '2026-08-11',
            fator: 4,
            status: 'confirmado',
            anoBase: 2026,
            razaoCvm: null,
          },
          {
            symbol: 'SIMH3',
            dataEvento: '2026-02-18',
            fator: 0.5,
            status: 'emissao_recompra',
            anoBase: 2026,
            razaoCvm: 0.68,
          },
        ],
      }),
    );

    it('ORVR3: 137,3 mi × 4 (split posterior à contagem) ⇒ R$ 10,99 bi (era R$ 1,66 bi)', () => {
      expect(linha(rr, 'ORVR3').valorMercado).toBeCloseTo(20 * 549_296_000, 2);
    });

    it("TEND3: a 'alerta' desmentida pelo LPA não entra ⇒ 122,6 mi ações", () => {
      expect(linha(rr, 'TEND3').valorMercado).toBeCloseTo(26.97 * 122_578_000, 2);
    });

    it('KLBN11: ÷ 5 ações por unit ⇒ R$ 22,3 bi (era R$ 111,5 bi)', () => {
      expect(linha(rr, 'KLBN11').valorMercado).toBeCloseTo((18.12 * 6_152_895_333) / 5, 0);
    });

    it("SIMH3: a contagem mais recente ('alerta', certa) e não a última 'ok' de 2024", () => {
      expect(linha(rr, 'SIMH3').valorMercado).toBeCloseTo(14.5 * 583_759_291, 2);
    });
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

describe('montarLinhasQuadro — critérios de fundamentos (v2.4)', () => {
  const compactoWege = {
    '5': {
      n: 5,
      de: 6,
      m: [['rec', 'atende', 'cresceu em 5 de 5 anos · 17.470 → 40.804 (R$ mi)']],
    },
  } as unknown as CriteriosCompactos;

  it('grava a cópia compacta e o perfil quando o job criterios avaliou o símbolo', () => {
    const r = montarLinhasQuadro(
      entrada({
        criterios: [
          { symbol: 'WEGE3', perfil: 'acao', criterios: compactoWege },
          { symbol: 'HGLG11', perfil: 'fii_tijolo', criterios: {} },
        ],
      }),
    );
    expect(linha(r, 'WEGE3')).toMatchObject({ criterios: compactoWege, perfilCriterios: 'acao' });
    expect(linha(r, 'HGLG11').perfilCriterios).toBe('fii_tijolo');
  });

  it('sem avaliação: colunas fora do createMany (nulas) e alerta só para linhas do Quadro', () => {
    const r = montarLinhasQuadro(
      entrada({ criterios: [{ symbol: 'WEGE3', perfil: 'acao', criterios: compactoWege }] }),
    );
    expect('criterios' in linha(r, 'TGMA3')).toBe(false);
    expect('perfilCriterios' in linha(r, 'TGMA3')).toBe(false);
    const a = r.alertas.find((x) => x.codigo === 'quadro_sem_criterios');
    expect(a?.nivel).toBe('aviso');
    expect(a?.mensagem).toContain('TGMA3');
    expect(a?.mensagem).not.toContain('WEGE3');
    const semCriteriosNoQuadro = r.linhas.filter((l) => l.noQuadro && l.symbol !== 'WEGE3');
    expect(a?.mensagem).toContain(`${semCriteriosNoQuadro.length} linhas do Quadro`);
  });

  it('todas as linhas avaliadas = sem alerta (100% das linhas do Quadro com critérios)', () => {
    const base = entrada();
    const simbolos = [...base.acoes.map((x) => x.symbol), ...base.fiis.map((x) => x.symbol)];
    const r = montarLinhasQuadro(
      entrada({
        criterios: simbolos.map((symbol) => ({
          symbol,
          perfil: 'acao' as const,
          criterios: compactoWege,
        })),
      }),
    );
    expect(r.alertas.map((x) => x.codigo)).not.toContain('quadro_sem_criterios');
    expect(r.linhas.every((l) => l.criterios !== undefined)).toBe(true);
  });
});
