/**
 * Fixtures das TELAS de Stocks e REITs (fatia C), montadas pelas MESMAS funções do servidor a partir
 * das fixtures SEC do banco efêmero (prisma/fixtures/analise-ativos/eua-fundamentos.json): o topo
 * (AtivoTopoResposta com `eua`) e o Essencial EUA de AAPL e O, sem cotação.
 */
import { lerFixturesEua } from '../../../../prisma/seedAnaliseAtivosEua';
import {
  montarFundamentosEua,
  valoresAnoSec,
  type PeriodoSec,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import { montarKpisEua } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import {
  dividendosEua,
  graficoEua,
  tagsEua,
} from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { SEC_URLS } from '@/types/analiseAtivosEua';
import type { AtivoTopoResposta, FundamentosResposta } from '@/types/analiseAtivosApi';

const EMPRESAS = lerFixturesEua().empresas;

export function periodosFixtureEua(ticker: string): PeriodoSec[] {
  const e = EMPRESAS.find((x) => x.ticker === ticker);
  if (!e) throw new Error(`fixture EUA sem ${ticker}`);
  return e.anos.map((a) => ({
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

function topo(ticker: 'AAPL' | 'O'): AtivoTopoResposta {
  const e = EMPRESAS.find((x) => x.ticker === ticker)!;
  const classe = e.classe;
  const periodos = periodosFixtureEua(ticker);
  const v = valoresAnoSec(periodos[periodos.length - 1]);
  const linha = {
    classe,
    setor: classe === 'stock' ? 'Indústria' : 'Finanças, seguros e imóveis',
    segmento: classe === 'reit' ? 'Net lease' : null,
    bolsa: e.bolsa,
  } as const;
  return {
    ticker,
    classe,
    nome: e.nome,
    tags: tagsEua(linha, e.exercicioFimMmdd),
    noQuadro: true,
    foraDoQuadroMotivo: null,
    assetId: null,
    fiiTipoCvm: null,
    cotacao: { preco: null, data: null, variacao: null, variacaoPct: null, baixaLiquidez: false },
    criterios: null,
    kpis: montarKpisEua({
      classe,
      ano: 2025,
      valores: { ...v, margemPct: v.margemPct },
      dpaCalculado: false,
      anosLucroConsecutivos: 11,
      anosDividendo: 9,
    }),
    grafico: graficoEua(classe, periodos),
    dividendos: dividendosEua(periodos),
    eventos: [],
    educacao: { titulo: 'Aprenda', href: '/educacao', descricao: null },
    frescor: { cotacao: null, fundamentos: 'SEC 10-K 2025', fii: null, painelAtrasado: false },
    versao: 'v-eua',
    eua: {
      cik: e.cik,
      bolsa: e.bolsa,
      moeda: 'USD',
      exercicioFimMmdd: e.exercicioFimMmdd,
      motivoSemPreco: 'licenca',
      linkDocumentos: SEC_URLS.documentos10k.replace('{cik}', e.cik),
      publicFloatData: e.publicFloatData,
      segmento: e.segmento ?? null,
    },
  };
}

export const ATIVO_AAPL_EUA: AtivoTopoResposta = topo('AAPL');
export const ATIVO_O_EUA: AtivoTopoResposta = topo('O');

export const FUNDAMENTOS_AAPL_EUA: FundamentosResposta = montarFundamentosEua({
  classe: 'stock',
  periodos: periodosFixtureEua('AAPL'),
  exercicioFimMmdd: '0927',
});
export const FUNDAMENTOS_O_EUA: FundamentosResposta = montarFundamentosEua({
  classe: 'reit',
  periodos: periodosFixtureEua('O'),
  exercicioFimMmdd: '1231',
});
