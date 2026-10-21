/**
 * fundamentei-regras F3 — telas EUA atrás das chaves de TELA:
 * - ANALISE_ATIVOS_REIT_FCO_AJUSTADO_HABILITADO: REIT com o caixa operacional ajustado pela
 *   remuneração em ações (Essencial, KPI, gráfico, Quadro, Comparador), sem FFO/AFFO/ocupação,
 *   colunasPendentes [] e a nota 'sbc_indisponivel' no ano sem SBC;
 * - ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO: nomes em inglês (lista fechada de textosEuaEn) nas
 *   colunas, KPIs, gráfico, Comparador e critérios (por id), frases em português.
 * Chaves desligadas = saída idêntica à de hoje. Nenhum texto com termo proibido (PT e EN).
 * Fixtures: 10-K extraídos da SEC (prisma/seedAnaliseAtivosEua) + SBC SINTÉTICA (fração do FCO).
 */
import { describe, expect, it } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import {
  lerFixturesEua,
  type EmpresaFixtureEua,
} from '../../../../../../prisma/seedAnaliseAtivosEua';
import {
  COLUNAS_ESSENCIAL_EUA,
  COLUNAS_ESSENCIAL_REIT_AJUSTADO,
  montarFundamentosEua,
  sufixoCacheLeituraEua,
  valoresAnoSec,
  valoresReitAjustado,
  type PeriodoSec,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import {
  montarKpisEua,
  type EntradaKpisEua,
} from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import { graficoEua } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import {
  montarCriteriosAtivo,
  rotuloCriterioLeitura,
} from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import {
  criteriosDoComparador,
  subComSbcIndisponivel,
} from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { camposReitAjustadoDaLinha } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import {
  CODIGOS_REIT_AJUSTADO,
  GRUPOS_REIT,
  GRUPOS_STOCK,
  catalogoComparador,
} from '@/services/analiseAtivos/regras/comparador/indicadores';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { ROTULOS_EUA_EN } from '@/services/analiseAtivos/textosEuaEn';
import { COLUNAS_PENDENTES_EUA } from '@/types/analiseAtivosEua';

const EMPRESAS = lerFixturesEua().empresas;
const empresa = (t: string) => EMPRESAS.find((e) => e.ticker === t) as EmpresaFixtureEua;

/** Fixture (10-K extraído) → PeriodoSec; `sbcFracao` = SBC SINTÉTICA como fração do FCO. */
function periodos(t: string, sbcFracao: number | null = null): PeriodoSec[] {
  return empresa(t).anos.map((a) => ({
    anoFiscal: a.ano,
    dtFim: a.dtFim,
    receita: a.receita,
    ebit: a.ebit,
    depreciacaoAmortizacao: a.depreciacaoAmortizacao,
    lucroLiquido: a.lucroLiquido,
    pl: a.pl,
    caixa: a.caixa,
    aplicacoesFinanceiras: a.aplicacoesFinanceiras,
    dividaBrutaCp: null,
    dividaBrutaLp: a.dividaBruta,
    fco: a.fco,
    capex: a.capex,
    dividendosPagos: a.dividendosPagos,
    acoesMediaDiluida: a.acoesMediaDiluida,
    lpaOn: a.lpa,
    dpa: a.dpa,
    dpaOrigem: a.dpaOrigem,
    flags: a.flags,
    ...(sbcFracao === null || a.fco === null ? {} : { remuneracaoAcoes: a.fco * sbcFracao }),
  }));
}

function textos(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textos(x, out));
  return out;
}
const semProibidas = (v: unknown) =>
  textos(v).flatMap((t) => encontrarProibidasV2(t).map((p) => `${p}: ${t}`));

const entradaO = (sbc: number | null = null) => ({
  classe: 'reit' as const,
  periodos: periodos('O', sbc),
  exercicioFimMmdd: '1231',
});

function kpisDe(classe: 'stock' | 'reit', p: PeriodoSec): EntradaKpisEua {
  const v = valoresAnoSec(p);
  const aj = valoresReitAjustado(v);
  return {
    classe,
    ano: p.anoFiscal,
    valores: {
      ...v,
      fcoAjustadoAcao: aj.fcoAjustadoAcao,
      divFcoAjustadoPct: aj.divFcoAjustadoPct,
      sbcIndisponivel: aj.sbcIndisponivel,
    },
    dpaCalculado: false,
    anosLucroConsecutivos: 11,
    anosDividendo: 9,
  };
}

describe('chaves desligadas = telas de hoje', () => {
  it('Essencial, KPIs e gráfico idênticos sem opções, com {} e com as chaves false', () => {
    const off = { reitFcoAjustado: false, rotulosEn: false };
    for (const [t, classe] of [
      ['AAPL', 'stock'],
      ['O', 'reit'],
    ] as const) {
      const e = { classe, periodos: periodos(t, 0.05), exercicioFimMmdd: '1231' };
      const hoje = montarFundamentosEua(e);
      expect(montarFundamentosEua(e, {})).toEqual(hoje);
      expect(montarFundamentosEua(e, off)).toEqual(hoje);
      expect(hoje).not.toHaveProperty('rotulosEn');
      expect(hoje).not.toHaveProperty('reitFcoAjustado');
      expect(hoje.linhas.every((l) => l.marcas === undefined)).toBe(true);
      expect(hoje.colunas.map((c) => c.codigo)).toEqual([...COLUNAS_ESSENCIAL_EUA[classe]]);
      expect(graficoEua(classe, e.periodos, off)).toEqual(graficoEua(classe, e.periodos));
      const k = kpisDe(classe, e.periodos.at(-1)!);
      expect(montarKpisEua(k, off)).toEqual(montarKpisEua(k));
    }
    expect(montarFundamentosEua(entradaO()).colunasPendentes).toEqual([...COLUNAS_PENDENTES_EUA]);
    expect(sufixoCacheLeituraEua({})).toBe('');
    expect(sufixoCacheLeituraEua(off)).toBe('');
  });

  it('linha do Quadro, catálogo do Comparador e chips do Quadro sem a chave: os de hoje', () => {
    expect(catalogoComparador('reit')).toBe(GRUPOS_REIT);
    expect(catalogoComparador('stock')).toBe(GRUPOS_STOCK);
    expect(catalogoComparador('reit', { reitFcoAjustado: false, rotulosEn: false })).toBe(
      GRUPOS_REIT,
    );
    expect(definicoesQuadro('reit', CRITERIA_PARAMS_V3, {})).toEqual(
      definicoesQuadro('reit', CRITERIA_PARAMS_V3),
    );
    expect(criteriosDoComparador(CRITERIA_PARAMS_V3, 'reit', ['acao'], {})).toEqual(
      criteriosDoComparador(CRITERIA_PARAMS_V3, 'reit', ['acao']),
    );
  });
});

describe('REIT com o caixa operacional ajustado (REIT_FCO_AJUSTADO)', () => {
  const on = { reitFcoAjustado: true };

  it('Essencial: colunas ajustadas, sem FFO/AFFO/ocupação, pendentes [] e sem a nota da fase 2', () => {
    const r = montarFundamentosEua(entradaO(0.05), on);
    const codigos = r.colunas.map((c) => c.codigo);
    expect(codigos).toEqual([...COLUNAS_ESSENCIAL_REIT_AJUSTADO]);
    for (const x of ['ffo', 'affo', 'ocupacao', 'imoveis']) expect(codigos).not.toContain(x);
    expect(r.colunasPendentes).toEqual([]);
    expect(r.reitFcoAjustado).toBe(true);
    const obs = r.observacoes.join(' ');
    expect(obs).not.toMatch(/FFO|AFFO|ocupação/);
    expect(obs).toMatch(/caixa operacional ajustado pela remuneração em ações/);
    const ult = r.linhas.at(-1)!;
    const sem = montarFundamentosEua(entradaO()).linhas.at(-1)!;
    const fcoAcao = (sem.valores.fcoAcao as { valor: number }).valor;
    const divFco = (sem.valores.divFco as { valor: number }).valor;
    expect((ult.valores.fcoAjustadoAcao as { valor: number }).valor).toBeCloseTo(fcoAcao * 0.95, 6);
    expect((ult.valores.divFcoAjustado as { valor: number }).valor).toBeCloseTo(divFco / 0.95, 6);
    expect(ult.marcas).toBeUndefined();
    expect(semProibidas(r)).toEqual([]);
  });

  it('ano sem SBC no 10-K: valor sem ajuste com a marca e a nota dos anos (nulo ≠ 0)', () => {
    const base = entradaO(0.05);
    const semSbc2025 = base.periodos.map((p) =>
      p.anoFiscal === 2025 ? { ...p, remuneracaoAcoes: null } : p,
    );
    const r = montarFundamentosEua({ ...base, periodos: semSbc2025 }, on);
    const ult = r.linhas.at(-1)!;
    const hoje = montarFundamentosEua(entradaO()).linhas.at(-1)!;
    expect(ult.valores.fcoAjustadoAcao).toEqual(hoje.valores.fcoAcao);
    expect(ult.valores.divFcoAjustado).toEqual(hoje.valores.divFco);
    expect(ult.marcas).toEqual({
      fcoAjustado: { sbcIndisponivel: true },
      fcoAjustadoAcao: { sbcIndisponivel: true },
      divFcoAjustado: { sbcIndisponivel: true },
    });
    expect(r.linhas.at(-2)!.marcas).toBeUndefined();
    expect(r.observacoes.join(' ')).toMatch(/FY2025: sem remuneração em ações informada no 10-K/);
    // SBC 0 informada é ajuste de zero, não "sem SBC"
    const zero = montarFundamentosEua(entradaO(0), on);
    expect(zero.linhas.every((l) => l.marcas === undefined)).toBe(true);
  });

  it('KPIs: caixa ajustado por ação e payout sobre ele; ano sem SBC = sem ajuste com o aviso', () => {
    const com = montarKpisEua(kpisDe('reit', periodos('O', 0.05).at(-1)!), on);
    expect(com.map((k) => k.codigo).slice(0, 3)).toEqual([
      'fcoAjustadoAcao',
      'dpa',
      'divFcoAjustado',
    ]);
    expect(com.map((k) => k.codigo)).not.toContain('fcoAcao');
    const sem = montarKpisEua(kpisDe('reit', periodos('O').at(-1)!), on);
    expect(sem[0].sub).toBe('sem remuneração em ações no 10-K · sem ajuste');
    const hoje = montarKpisEua(kpisDe('reit', periodos('O').at(-1)!));
    expect(sem[0].valor).toEqual(hoje[0].valor);
    // stock não muda com a chave do REIT
    const k = kpisDe('stock', periodos('AAPL', 0.05).at(-1)!);
    expect(montarKpisEua(k, on)).toEqual(montarKpisEua(k));
  });

  it('gráfico: caixa ajustado por ação; anos sem SBC viram lacunas com a nota', () => {
    const g = graficoEua('reit', periodos('O', 0.05), on);
    expect(g.titulo).toBe('Caixa operacional ajustado por ação por ano');
    expect(g.lacunas).toEqual([]);
    const s = graficoEua('reit', periodos('O'), on);
    expect(s.lacunas.length).toBe(s.serieA.pontos.filter((p) => p.valor !== null).length);
    expect(s.lacunas[0].texto).toMatch(/sem remuneração em ações informada no 10-K/);
    expect(s.serieA.pontos).toEqual(graficoEua('reit', periodos('O')).serieA.pontos);
  });

  it('linha do Quadro: escolhe a coluna ajustada; sem SBC fica a sem ajuste com sbcIndisponivel', () => {
    const row = {
      moeda: 'USD',
      fcoPorAcao: 4.4,
      dividendosFcoPct: 73.1,
      fcoAjustadoPorAcao: 4.2,
      dividendosFcoAjustadoPct: 76.5,
    } as Pick<
      AnaliseQuadroLinha,
      | 'moeda'
      | 'fcoPorAcao'
      | 'dividendosFcoPct'
      | 'fcoAjustadoPorAcao'
      | 'dividendosFcoAjustadoPct'
    >;
    expect(camposReitAjustadoDaLinha(row)).toEqual({
      fcoPorAcao: 4.2,
      dividendosFcoPct: 76.5,
      fcoAjustadoPorAcao: 4.2,
      dividendosFcoAjustadoPct: 76.5,
      sbcIndisponivel: false,
    });
    expect(
      camposReitAjustadoDaLinha({
        ...row,
        fcoAjustadoPorAcao: null,
        dividendosFcoAjustadoPct: null,
      }),
    ).toEqual({
      fcoPorAcao: 4.4,
      dividendosFcoPct: 73.1,
      fcoAjustadoPorAcao: null,
      dividendosFcoAjustadoPct: null,
      sbcIndisponivel: true,
    });
    expect(camposReitAjustadoDaLinha({ ...row, moeda: null })).toEqual({});
  });

  it('Comparador: Geração de caixa ajustada e nota dos tickers sem SBC no sub', () => {
    const g = catalogoComparador('reit', on).find((x) => x.codigo === 'geracaoCaixa')!;
    expect(g.linhas.map((l) => l.codigo)).toEqual([...CODIGOS_REIT_AJUSTADO]);
    expect(subComSbcIndisponivel('dividendos pagos ÷ caixa operacional ajustado', [])).toBe(
      'dividendos pagos ÷ caixa operacional ajustado',
    );
    expect(subComSbcIndisponivel('sub', ['O', 'PLD'])).toBe(
      'sub · O, PLD: sem remuneração em ações no 10-K, sem ajuste',
    );
    // os outros grupos são os de hoje
    expect(catalogoComparador('reit', on).filter((x) => x.codigo !== 'geracaoCaixa')).toEqual(
      GRUPOS_REIT.filter((x) => x.codigo !== 'geracaoCaixa'),
    );
  });

  it('Quadro: sai o chip da ocupação (filtro indisponível)', () => {
    const ids = definicoesQuadro('reit', CRITERIA_PARAMS_V3, on).map((d) => d.id);
    expect(ids).not.toContain('ocup');
    expect(definicoesQuadro('reit', CRITERIA_PARAMS_V3).map((d) => d.id)).toContain('ocup');
    expect(definicoesQuadro('stock', CRITERIA_PARAMS_V3, on)).toEqual(
      definicoesQuadro('stock', CRITERIA_PARAMS_V3),
    );
  });
});

describe('rótulos em inglês (EUA_ROTULOS_EN)', () => {
  const en = { rotulosEn: true };

  it('Essencial: nomes da lista fechada; notas em português, sem o lucro sem não recorrentes', () => {
    const s = montarFundamentosEua(
      { classe: 'stock', periodos: periodos('AAPL'), exercicioFimMmdd: '0927' },
      en,
    );
    expect(s.rotulosEn).toBe(true);
    expect(s.colunas.map((c) => c.rotulo)).toEqual([
      'Revenue',
      'EBITDA',
      'Net income',
      'Net margin',
      'Net debt',
      'Net debt/EBITDA',
      'FCF/CAPEX',
      'ROE',
      'EPS (US$)',
      'Dividend/share (US$)',
      'Payout',
    ]);
    expect(s.observacoes.join(' ')).not.toMatch(/não recorrentes/);
    const r = montarFundamentosEua(entradaO(0.05), { ...en, reitFcoAjustado: true });
    expect(r.colunas.map((c) => c.rotulo)).toEqual([
      'Revenue',
      'Net income',
      'Operating cash flow',
      'OCF adj. (SBC)',
      'OCF adj./share (US$)',
      'Dividend/share (US$)',
      'Payout (÷ OCF adj.)',
      'Net debt/EBITDA',
    ]);
    const lista = new Set<string>(Object.values(ROTULOS_EUA_EN));
    for (const c of [...s.colunas, ...r.colunas]) expect(lista.has(c.rotulo), c.rotulo).toBe(true);
    expect(semProibidas([s, r])).toEqual([]);
  });

  it('KPIs e gráfico: nome EN, linha de apoio em português', () => {
    const k = montarKpisEua(kpisDe('stock', periodos('AAPL').at(-1)!), en);
    expect(k.map((x) => x.rotulo)).toEqual([
      'ROE',
      'Net margin',
      'Net debt/EBITDA',
      'EPS (US$)',
      'Dividend/share (US$)',
      'Payout',
      'Profit streak',
    ]);
    expect(k[1].sub).toMatch(/lucro ÷ receita/);
    const kr = montarKpisEua(kpisDe('reit', periodos('O').at(-1)!), en);
    expect(kr.find((x) => x.codigo === 'receita')).toMatchObject({
      rotulo: 'Revenue',
      sub: 'US$ bi · FY2025',
    });
    expect(kr.find((x) => x.codigo === 'divFco')?.rotulo).toBe('Payout (÷ OCF)');
    const g = graficoEua('stock', periodos('AAPL'), en);
    expect(g.titulo).toBe('EPS (US$) por ano');
    expect(g.serieA.rotulo).toBe('EPS (US$)');
    expect(graficoEua('reit', periodos('O', 0.05), { ...en, reitFcoAjustado: true }).titulo).toBe(
      'OCF adj./share (US$) por ano',
    );
    expect(semProibidas([k, kr, g])).toEqual([]);
  });

  it('Comparador: linhas EUA em inglês; grupos e linhas de apoio em português', () => {
    const g = catalogoComparador('reit', { ...en, reitFcoAjustado: true });
    expect(g.flatMap((x) => x.linhas.map((l) => l.rotulo))).toEqual([
      'OCF adj./share (US$)',
      'Payout (÷ OCF adj.)',
      'Profit streak',
      'Div. growing',
      'Net debt/EBITDA',
      'Dividend/share (US$)',
    ]);
    expect(g.map((x) => x.rotulo)).toEqual(GRUPOS_REIT.map((x) => x.rotulo));
    expect(semProibidas(g.map((x) => x.linhas.map((l) => [l.rotulo, l.sub])))).toEqual([]);
  });

  it('critérios por id: card, Comparador e chips do Quadro em inglês; perfis BR ficam em PT', () => {
    const reit = CRITERIA_PARAMS_V3.perfis.reit!;
    const rec = reit.find((c) => c.id === 'rec')!;
    expect(rotuloCriterioLeitura('reit', rec, en)).toBe('Revenue growing');
    expect(rotuloCriterioLeitura('reit', rec, {})).toBe(rec.rotulo);
    const acao = CRITERIA_PARAMS_V3.perfis.acao[0];
    expect(rotuloCriterioLeitura('acao', acao, en)).toBe(acao.rotulo);
    const chips = definicoesQuadro('stock', CRITERIA_PARAMS_V3, en).map((d) => d.rotulo);
    expect(chips[0]).toBe('Revenue growing');
    expect(chips).toContain('Net margin positive');
    const comp = criteriosDoComparador(CRITERIA_PARAMS_V3, 'reit', ['acao'], en);
    expect(comp.rotulos.pay).toBe('Payout ≤ 90% of OCF');
    // card (lerCriterios): rótulo EN e, na série 'ebit' (v5), o selo do degrau do EBIT
    const linhas = [
      {
        classe: 'stock',
        perfil: 'stock',
        janela: 5,
        anoInicio: 2021,
        anoFim: 2025,
        atendidos: 1,
        aplicaveis: 2,
        paramsVersion: 5,
        resultados: [
          { id: 'ebitda', estado: 'atende', n: 5, de: 5, fato: 'x', serie: [] },
          { id: 'rec', estado: 'atende', n: 5, de: 5, fato: 'y', serie: [] },
        ],
      },
    ];
    const stockV5 = CRITERIA_PARAMS_V3.perfis.stock!.map((c) =>
      c.id === 'ebitda' ? { ...c, tipo: 'cagr' as const, serie: 'ebit' as const } : c,
    );
    const params = {
      ...CRITERIA_PARAMS_V3,
      perfis: { ...CRITERIA_PARAMS_V3.perfis, stock: stockV5 },
    } as CriteriaParams;
    const card = montarCriteriosAtivo(linhas, params, null, en)!;
    const itens = card.janelas['5'].itens;
    expect(itens.find((i) => i.id === 'ebitda')?.rotulo).toBe('EBIT: annual growth > 0');
    expect(itens.find((i) => i.id === 'ebitda')?.definicao).toContain(TEXTOS_EUA.ebit.degraus);
    expect(itens.find((i) => i.id === 'rec')?.rotulo).toBe('Revenue growing');
    const pt = montarCriteriosAtivo(linhas, params, null)!.janelas['5'].itens;
    expect(pt.find((i) => i.id === 'rec')?.rotulo).toBe(
      CRITERIA_PARAMS_V3.perfis.stock!.find((c) => c.id === 'rec')!.rotulo,
    );
    // v3 (série 'ebitda'): sem o selo do EBIT
    const v3 = montarCriteriosAtivo(linhas, CRITERIA_PARAMS_V3, null)!.janelas['5'].itens;
    expect(v3.find((i) => i.id === 'ebitda')?.definicao).not.toContain(TEXTOS_EUA.ebit.degraus);
  });
});
