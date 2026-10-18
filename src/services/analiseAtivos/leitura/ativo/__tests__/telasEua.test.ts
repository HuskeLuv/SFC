import { describe, expect, it } from 'vitest';
import {
  lerFixturesEua,
  type EmpresaFixtureEua,
} from '../../../../../../prisma/seedAnaliseAtivosEua';
import {
  COLUNAS_ESSENCIAL_EUA,
  montarFundamentosEua,
  umPeriodoPorAno,
  valoresAnoSec,
  type PeriodoSec,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import { montarKpisEua } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import {
  dividendosEua,
  graficoEua,
  tagsEua,
} from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';

const EMPRESAS = lerFixturesEua().empresas;
const empresa = (t: string) => EMPRESAS.find((e) => e.ticker === t) as EmpresaFixtureEua;

/** Fixture (10-K extraído) → PeriodoSec, como a fatia A grava em AssetFundamentalsPeriod. */
function periodos(t: string): PeriodoSec[] {
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
  }));
}

/** Todas as strings de um objeto (varredura de linguagem). */
function textos(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textos(x, out));
  return out;
}

describe('textos das telas EUA', () => {
  it('linguagem v2 e nenhum nome de índice', () => {
    for (const t of textos(TEXTOS_EUA_TELAS)) {
      expect(encontrarProibidasV2(t), t).toEqual([]);
      expect(t).not.toMatch(/S&P|MSCI|Dow Jones|Russell|Nasdaq-100/);
    }
  });
});

describe('Essencial EUA', () => {
  it('AAPL: colunas do stock em US$ bi, FY, último ano marcado, sem colunas de preço', () => {
    const r = montarFundamentosEua({
      classe: 'stock',
      periodos: periodos('AAPL'),
      exercicioFimMmdd: '0927',
    });
    expect(r.fonte).toBe('SEC');
    expect(r.unidade).toBe('US$ bi');
    expect(r.colunas.map((c) => c.codigo)).toEqual([...COLUNAS_ESSENCIAL_EUA.stock]);
    expect(r.colunas.map((c) => c.codigo)).not.toEqual(
      expect.arrayContaining(['pl', 'pe', 'ps', 'dy']),
    );
    const ultima = r.linhas[r.linhas.length - 1];
    expect(ultima).toMatchObject({ rotulo: 'FY2025', ultimoAno: true });
    expect(ultima.valores.receita).toMatchObject({ estado: 'ok' });
    expect((ultima.valores.receita as { valor: number }).valor).toBeCloseTo(416.2, 1);
    expect((ultima.valores.divLiqEbitda as { valor: number }).valor).toBeCloseTo(0.25, 2);
    expect(r.observacoes[0]).toMatch(/termina em set/);
    expect(r.colunasPendentes).toBeUndefined();
    // set/2025 é o mesmo ano do 10-K: sem a nota do ano fiscal anterior
    expect(r.observacoes.join(' ')).not.toMatch(/no 10-K da empresa ele aparece/);
  });

  it('exercício que termina em jan/fev: nota FY2025 = encerrado em jan/2026 = Fiscal 2026 (NVDA)', () => {
    const base = periodos('AAPL');
    const nvda = base.map((p) => ({ ...p, dtFim: `${p.anoFiscal + 1}-01-25` }));
    const r = montarFundamentosEua({ classe: 'stock', periodos: nvda, exercicioFimMmdd: '0125' });
    expect(r.observacoes[0]).toMatch(/termina em jan/);
    expect(r.observacoes).toContain(
      'FY2025 = exercício encerrado em jan/2026; no 10-K da empresa ele aparece como Fiscal 2026.',
    );
    expect(r.observacoes.flatMap((t) => encontrarProibidasV2(t))).toEqual([]);
  });

  it('O (REIT): sem FFO/AFFO/Ocupação/Imóveis — pendentes com a observação', () => {
    const r = montarFundamentosEua({
      classe: 'reit',
      periodos: periodos('O'),
      exercicioFimMmdd: '1231',
    });
    const codigos = r.colunas.map((c) => c.codigo);
    expect(codigos).toEqual([...COLUNAS_ESSENCIAL_EUA.reit]);
    for (const x of ['ffo', 'affo', 'ocupacao', 'imoveis']) expect(codigos).not.toContain(x);
    expect(r.colunasPendentes).toEqual(['ffo', 'affo', 'ocupacao', 'imoveis']);
    expect(r.observacoes.join(' ')).toMatch(/FFO, AFFO, ocupação e número de imóveis/);
    // EBITDA pelo degrau de fallback vira observação com os anos
    expect(r.observacoes.join(' ')).toMatch(/sem lucro operacional/);
    const fy = r.linhas.find((l) => l.ano === 2025)!;
    expect((fy.valores.divFco as { valor: number }).valor).toBeCloseTo(73, 0);
    expect((fy.valores.fcoAcao as { valor: number }).valor).toBeCloseTo(4.4, 1);
  });

  it('JPM (financeira): dívida líquida e FCL sem dado, nunca caixa líquido', () => {
    const v = valoresAnoSec(periodos('JPM').at(-1)!);
    expect(v.dividaLiquida).toBeNull();
    expect(v.divLiqEbitda).toBeNull();
    expect(v.fclCapex).toBeNull();
  });

  it('um FY por ano: último dtFim e maior versão', () => {
    const r = umPeriodoPorAno([
      { anoFiscal: 2024, dtFim: '2024-12-31', versao: 1 },
      { anoFiscal: 2024, dtFim: '2024-12-31', versao: 2 },
      { anoFiscal: 2023, dtFim: '2023-12-31', versao: 1 },
    ]);
    expect(r.map((x) => [x.anoFiscal, x.versao])).toEqual([
      [2023, 1],
      [2024, 2],
    ]);
  });
});

describe('topo EUA', () => {
  it('tags sem índice: setor, bolsa e FY; REIT com segmento e REIT de patrimônio', () => {
    expect(
      tagsEua({ classe: 'stock', setor: 'Indústria', segmento: null, bolsa: 'Nasdaq' }, '0927'),
    ).toEqual(['Indústria', 'Nasdaq', 'FY termina em set']);
    expect(
      tagsEua(
        {
          classe: 'reit',
          setor: 'Finanças, seguros e imóveis',
          segmento: 'Net lease',
          bolsa: 'NYSE',
        },
        '1231',
      ),
    ).toEqual(['Net lease', 'NYSE', 'REIT de patrimônio', 'FY termina em dez']);
  });

  it('gráfico LPA por ano (stock) e caixa op./ação (REIT), sem série de cotação', () => {
    const g = graficoEua('stock', periodos('AAPL'));
    expect(g.titulo).toBe('LPA por ano');
    expect(g.serieB.pontos).toEqual([]);
    expect(g.serieA.pontos.at(-1)).toEqual({ chave: '2025', valor: 7.46 });
    const r = graficoEua('reit', periodos('O'));
    expect(r.titulo).toBe('Caixa operacional por ação por ano');
    expect(r.insuficiente).toBe(false);
  });

  it('dividendos por FY com crescimento anual de 5 anos', () => {
    const d = dividendosEua(periodos('O'));
    expect(d.anos.at(-1)?.ano).toBe(2025);
    expect(d.cagrAnoInicio).toBe(2020);
    expect(d.cagr5aPct).toBeGreaterThan(0);
  });

  it('KPIs sem nada que dependa de cotação', () => {
    for (const classe of ['stock', 'reit'] as const) {
      const kpis = montarKpisEua({
        classe,
        ano: 2025,
        valores: {
          ...valoresAnoSec(periodos(classe === 'stock' ? 'AAPL' : 'O').at(-1)!),
          margemPct: 26.9,
        },
        dpaCalculado: false,
        anosLucroConsecutivos: 11,
        anosDividendo: 9,
      });
      expect(kpis).toHaveLength(7);
      const codigos = kpis.map((k) => k.codigo);
      for (const c of ['pl', 'pvp', 'dy12m', 'preco']) expect(codigos).not.toContain(c);
    }
  });
});
